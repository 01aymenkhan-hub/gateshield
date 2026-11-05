import asyncio
import io
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import numpy as np
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app, InferenceGate, MAX_UPLOAD_BYTES, _scan
from app.ocr_engine import normalize_results
from app.parser import parse_cnic_fields, validate_cnic, validate_date
from app.dls_parser import extract_date_from_string, parse_dls_fields
from app.pipeline import decode_image, InvalidImage


def box(text, x=400, y=500, confidence=1.0):
    return {"text": text, "confidence": confidence, "bbox": [[x,y],[x+180,y],[x+180,y+20],[x,y+20]]}


class ValidationTests(unittest.TestCase):
    def test_calendar_dates(self):
        for text in ("31.02.2000", "29.02.2001", "31.04.2020", "2020-13-01"):
            with self.subTest(text=text):
                self.assertEqual(validate_date(text), "")
        self.assertEqual(validate_date("29.02.2000"), "2000-02-29")
        self.assertEqual(validate_date("DOB:01/01/2000"), "2000-01-01")

    def test_dls_calendar_dates(self):
        self.assertEqual(extract_date_from_string("31-Feb-2000")[0], "")
        self.assertEqual(extract_date_from_string("31.04.2000")[0], "")
        self.assertEqual(extract_date_from_string("29-Feb-2000")[0], "29-Feb-2000")

    def test_cnic_format_and_prefix(self):
        self.assertEqual(validate_cnic("00000-0000000-0"), "")
        self.assertEqual(validate_cnic("9999912345671"), "")
        self.assertEqual(validate_cnic("12345 1234567 1"), "12345-1234567-1")
        self.assertEqual(validate_cnic("12345-1234S67-1"), "12345-1234567-1")

    def test_dob_never_invents_sample_identity(self):
        parsed = parse_cnic_fields(np.zeros((630,1000,3), np.uint8),
                                  [box("11111-1111111-1"), box("12.11.1998", y=540)])
        self.assertEqual(parsed["name"], "")
        self.assertEqual(parsed["fatherName"], "")
        self.assertEqual(parsed["cnicIdentification"], "")

    def test_noise_never_invents_sample_identity(self):
        parsed = parse_cnic_fields(np.zeros((630,1000,3), np.uint8),
                                  [box("Gwsinein", y=280),box("11111-1111111-1"),box("12.11.1998",y=540)])
        self.assertEqual(parsed["name"], "")
        self.assertEqual(parsed["fatherName"], "")

    def test_old_card_english_noise_does_not_become_a_person_name(self):
        parsed=parse_cnic_fields(np.zeros((630,1000,3),np.uint8),
            [box("RANDOM OCR WORDS",y=280),box("11111-1111111-1"),box("12.11.1998",y=540)])
        self.assertEqual(parsed["name"],"")
        self.assertEqual(parsed["fatherName"],"")
        self.assertEqual(parsed["dateOfIssue"],"")
        self.assertEqual(parsed["dateOfExpiry"],"")

    def test_dls_title_is_not_a_licence_number(self):
        parsed = parse_dls_fields(np.zeros((630,1000,3), np.uint8),
                                 [box("License No.", x=200,y=100), box("DRIVING LICENSE SINDH",x=400,y=100)])
        self.assertEqual(parsed["licenseNumber"], "")

    def test_model_arrays_are_json_serializable(self):
        parsed = normalize_results([{"rec_texts":["Test"], "rec_scores":np.array([.99]),
                                    "rec_polys":np.array([[[1,2],[3,2],[3,4],[1,4]]])}])
        self.assertEqual(parsed["results"][0]["bbox"], [[1,2],[3,2],[3,4],[1,4]])
        self.assertEqual(parsed["results"][0]["confidence"], .99)
        self.assertIs(parsed["results"], parsed["details"])

    def test_empty_and_corrupt_image(self):
        for raw in (b"", b"not an image"):
            with self.subTest(raw=raw), self.assertRaises(InvalidImage):
                decode_image(raw)

    def test_blank_rejected_before_inference(self):
        image = io.BytesIO(); Image.new("RGB", (1000,630), "white").save(image,format="PNG")
        with self.assertRaises(InvalidImage) as context:
            decode_image(image.getvalue())
        self.assertEqual(context.exception.status_code, 422)

    def test_pixel_limit(self):
        image=io.BytesIO(); Image.new("RGB",(100,100)).save(image,format="PNG")
        with patch.dict("os.environ", {"OCR_MAX_PIXELS":"5000"}), self.assertRaises(InvalidImage) as context:
            decode_image(image.getvalue())
        self.assertEqual(context.exception.status_code, 413)

    def test_camera_exif_rotation_before_pixel_processing(self):
        image=Image.fromarray(np.tile(np.arange(80, dtype=np.uint8), (40,1)))
        exif=Image.Exif(); exif[274]=6
        raw=io.BytesIO(); image.save(raw,format="JPEG",exif=exif)
        self.assertEqual(decode_image(raw.getvalue()).shape, (80,40,3))


class AdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_disconnected_request_holds_slot_until_process_finishes(self):
        gate=InferenceGate(workers=3)
        loop=asyncio.get_running_loop()
        job=loop.create_future()
        submitted=asyncio.Event()
        def submit(*args):
            submitted.set()
            return job
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(gate=gate,executor=object())))
        upload=UploadFile(file=io.BytesIO(b'synthetic'),filename='test.jpg')
        with patch.object(loop,'run_in_executor',side_effect=submit):
            task=asyncio.create_task(_scan(request,upload,'cnic'))
            await asyncio.wait_for(submitted.wait(),timeout=3)
            task.cancel()
            await asyncio.sleep(.01)
            self.assertEqual(gate.inflight,1)
            self.assertFalse(job.cancelled())
            job.set_result({'timing':{}})
            with self.assertRaises(asyncio.CancelledError):await task
        self.assertEqual(gate.inflight,0)

    async def test_three_workers_are_admitted_and_fourth_is_rejected_without_queue(self):
        gate=InferenceGate(queue_size=0,workers=3)
        async with gate.acquire(),gate.acquire(),gate.acquire():
            self.assertEqual(gate.inflight,3)
            with self.assertRaises(HTTPException) as failure:
                async with gate.acquire():self.fail('fourth job admitted')
            self.assertEqual(failure.exception.status_code,503)
        self.assertEqual(gate.inflight,0)

    async def test_queue_overload(self):
        gate = InferenceGate(queue_size=0)
        async with gate.acquire():
            with self.assertRaises(HTTPException) as context:
                async with gate.acquire():
                    self.fail("over-capacity request admitted")
            self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(gate.inflight, 0)

    async def test_queue_timeout_releases_accounting(self):
        gate = InferenceGate(queue_size=1, timeout=.01)
        async with gate.acquire():
            with self.assertRaises(HTTPException) as context:
                async with gate.acquire():
                    self.fail("request should time out")
            self.assertEqual(context.exception.status_code, 503)
            self.assertEqual(gate.inflight, 1)
        self.assertEqual(gate.inflight, 0)
        async with gate.acquire():
            pass

    async def test_cancelled_waiter_releases_accounting(self):
        gate=InferenceGate(queue_size=1)
        async def waiter():
            async with gate.acquire():
                pass
        async with gate.acquire():
            task=asyncio.create_task(waiter())
            await asyncio.sleep(.01)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertEqual(gate.inflight,1)
        self.assertEqual(gate.inflight,0)


class HttpValidationTests(unittest.TestCase):
    """Control-path tests only. Real OCR acceptance runs are separate."""
    def setUp(self):
        self.warmup=patch("app.main.warmup_models", return_value=None)
        self.warmup.start()
        self.client=TestClient(app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None,None,None)
        self.warmup.stop()

    def test_missing_upload(self):
        self.assertEqual(self.client.post("/scan-cnic").status_code,422)

    def test_empty_upload(self):
        for route in ("/scan-cnic","/scan-dls"):
            with self.subTest(route=route):
                self.assertEqual(self.client.post(route,files={"file":("empty.jpg",b"","image/jpeg")}).status_code,400)

    def test_corrupt_upload(self):
        self.assertEqual(self.client.post("/scan-dls",files={"file":("bad.jpg",b"bad","image/jpeg")}).status_code,400)

    def test_unsupported_extension(self):
        self.assertEqual(self.client.post("/scan-cnic",files={"file":("bad.txt",b"x","text/plain")}).status_code,400)

    def test_upload_limit(self):
        r=self.client.post("/scan-cnic",files={"file":("big.jpg",b"a"*(MAX_UPLOAD_BYTES+1),"image/jpeg")})
        self.assertEqual(r.status_code,413)

    def test_streaming_body_limit_without_content_length(self):
        boundary="ocr-stream-limit"
        def stream():
            yield f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.jpg"\r\n\r\n'.encode()
            yield b"x" * (70 * 1024)
            yield f"\r\n--{boundary}--\r\n".encode()
        with patch("app.main.MAX_UPLOAD_BYTES",32):
            r=self.client.post("/scan-cnic",content=stream(),headers={"Content-Type":f"multipart/form-data; boundary={boundary}"})
        self.assertEqual(r.status_code,413)

    def test_health(self):
        self.assertEqual(self.client.get("/").status_code,200)

    def test_internal_failure_is_not_exposed(self):
        with patch("app.main.process_image",side_effect=RuntimeError("private/path/password")):
            r=self.client.post("/scan-dls",files={"file":("test.jpg",b"x","image/jpeg")})
        self.assertEqual(r.status_code,500)
        self.assertNotIn("password",r.text)


if __name__ == "__main__":
    unittest.main()
