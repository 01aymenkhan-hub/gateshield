import unittest
from unittest.mock import patch

import numpy as np

from app.old_cnic import (RecognitionUnavailable, _english_name, _worker_request,
                          clean_urdu_name, clean_native_name, name_crop, recognize_names)
from app.pipeline import InvalidImage, process_image


def detection(text, y):
    return {"text":text,"confidence":.3,"bbox":[[400,y],[780,y],[780,y+45],[400,y+45]]}


class OldCardNameTests(unittest.TestCase):
    def test_labels_and_unicode_are_not_part_of_person_name(self):
        self.assertEqual(clean_urdu_name("نام : محمد علی"),"محمد علی")
        self.assertEqual(clean_urdu_name("والد کا نام : بلال احمد"),"بلال احمد")

    def test_noise_dates_labels_and_sentences_are_rejected(self):
        for text in ("FAKE NAME", "نام", "جنس مرد", "12/11/1998", "نام واضح نہیں", ""):
            with self.subTest(text=text):self.assertEqual(clean_urdu_name(text),"")

    def test_names_preserve_original_script_without_conversion(self):
        self.assertEqual(clean_native_name("محمد علی"),"محمد علی")
        self.assertEqual(clean_native_name("Ahsan Iftikhar"),"Ahsan Iftikhar")
        self.assertEqual(clean_native_name("نامور خان"),"نامور خان")
        self.assertEqual(_english_name("محمد علی"),"")
        self.assertEqual(_english_name("The name is Ali"),"")

    def test_unreadable_placeholders_are_not_person_names_in_either_script(self):
        for value in ('None','null','Unavailable','Not readable','ناقابل مطالعہ','نامعلوم شخص'):
            with self.subTest(value=value):self.assertEqual(clean_native_name(value),'')

    def test_no_detection_never_invokes_generative_recognition(self):
        with patch("app.old_cnic._worker_request") as request:
            result=recognize_names(np.zeros((630,1000,3),np.uint8),[])
        request.assert_not_called()
        self.assertEqual(result["name"],"")
        self.assertEqual(result["fatherName"],"")

    def test_blank_name_row_is_not_sent_to_worker(self):
        self.assertIsNone(name_crop(np.full((630,1000,3),255,np.uint8),[detection("noise",270)],"name"))

    def test_dob_and_identity_number_are_not_name_crops(self):
        image=np.random.default_rng(0).integers(0,255,(630,1000,3),dtype=np.uint8)
        for text in ("11111-1111111-1","12.11.1998"):
            self.assertIsNone(name_crop(image,[detection(text,270)],"name"))

    def test_name_changes_with_recognized_text_without_identity_lookup(self):
        image=np.random.default_rng(0).integers(0,255,(1386,2200,3),dtype=np.uint8)
        rows=[detection("noise",270),detection("noise",380)]
        with patch("app.old_cnic._worker_request",side_effect=[("نام : حسن علی",.99),("والد کا نام : محمد اسلم",.99)]):
            result=recognize_names(image,rows)
        self.assertEqual(result["name"],"حسن علی")
        self.assertEqual(result["fatherName"],"محمد اسلم")

    def test_low_confidence_and_worker_failure_do_not_invent_names(self):
        image=np.random.default_rng(0).integers(0,255,(1386,2200,3),dtype=np.uint8)
        rows=[detection("noise",270),detection("noise",380)]
        with patch("app.old_cnic._worker_request",side_effect=[("حسن علی",.2),RecognitionUnavailable("offline")]):
            result=recognize_names(image,rows)
        self.assertEqual(result["name"],"")
        self.assertEqual(result["fatherName"],"")
        self.assertTrue(result["warnings"])
        self.assertEqual(result["fieldStatus"]["name"],"low_confidence")
        self.assertEqual(result["fieldStatus"]["fatherName"],"worker_unavailable")

    def test_unknown_urdu_names_do_not_make_extra_conversion_requests(self):
        image=np.random.default_rng(0).integers(0,255,(1386,2200,3),dtype=np.uint8)
        rows=[detection("noise",270),detection("noise",380)]
        with patch('app.old_cnic._worker_request',side_effect=[('احسن افتخار',.99),('جاوید اقبال',.99)]) as request:
            result=recognize_names(image,rows)
        self.assertEqual(request.call_count,2)
        self.assertEqual(result['name'],'احسن افتخار')
        self.assertEqual(result['fatherName'],'جاوید اقبال')

    def test_english_source_names_remain_english(self):
        image=np.random.default_rng(0).integers(0,255,(1386,2200,3),dtype=np.uint8)
        rows=[detection("noise",270),detection("noise",380)]
        with patch('app.old_cnic._worker_request',side_effect=[('ALI AHMED',.99),('Father Name: ZAFAR AHMED',.99)]):
            result=recognize_names(image,rows)
        self.assertEqual(result['name'],'ALI AHMED')
        self.assertEqual(result['fatherName'],'ZAFAR AHMED')

    def test_predictable_father_label_does_not_make_weak_reading_acceptable(self):
        image=np.random.default_rng(0).integers(0,255,(1386,2200,3),dtype=np.uint8)
        rows=[detection("noise",270),detection("noise",380)]
        with patch('app.old_cnic._worker_request',side_effect=[('حسن علی',.95),('والد کا نام : محمد علی',.79)]):
            result=recognize_names(image,rows)
        self.assertEqual(result['name'],'حسن علی')
        self.assertEqual(result['fatherName'],'')
        self.assertEqual(result['fieldStatus']['fatherName'],'low_confidence')

    def test_merged_detector_polygon_is_clipped_to_name_region(self):
        image=np.random.default_rng(0).integers(0,255,(630,1000,3),dtype=np.uint8)
        image[:int(.39*630)]=[0,0,255]
        # A merged box is centred in the name ROI but starts above it at the ID.
        row={'text':'noise','bbox':[[350,200],[850,200],[850,320],[350,320]]}
        crop=name_crop(image,[row],'name')
        self.assertIsNotNone(crop)
        self.assertLessEqual(crop.shape[0],int(.53*630)-int(.39*630))
        self.assertFalse(np.any(np.all(crop==[0,0,255],axis=2)))

    def test_small_capture_requires_retake_without_guessing(self):
        image=np.random.default_rng(0).integers(0,255,(756,1200,3),dtype=np.uint8)
        with patch("app.old_cnic._worker_request") as request:
            result=recognize_names(image,[detection("noise",270),detection("noise",380)])
        request.assert_not_called()
        self.assertEqual(result["name"],"")
        self.assertEqual(result["fatherName"],"")
        self.assertIn("Retake",result["warnings"][0])
        self.assertEqual(result["fieldStatus"]["name"],"insufficient_resolution")

    def test_images_cannot_be_sent_to_external_ocr_hosts(self):
        with patch.dict("os.environ",{"OCR_URDU_URL":"https://external.invalid"}), patch("app.old_cnic.requests.post") as request:
            with self.assertRaises(RecognitionUnavailable):_worker_request("test")
        request.assert_not_called()

    def test_fast_old_scan_never_calls_name_models_and_preserves_number(self):
        image=np.zeros((1260,2000,3),np.uint8)
        result={"text":["11111-1111111-1","01.01.2000"],"results":[]}
        with patch('app.pipeline.decode_image',return_value=image), \
             patch('app.pipeline.orient_image',return_value=(image,0)), \
             patch('app.pipeline.run_ocr',return_value=result), \
             patch('app.pipeline.detect_cnic_format',return_value='old'), \
             patch('app.pipeline.parse_cnic_fields',return_value={'cnic':'11111-1111111-1','dateOfBirth':'2000-01-01','name':'OCR noise','fatherName':'OCR noise'}), \
             patch('app.old_cnic._worker_request') as vision, \
             patch('app.transliteration.english_names') as transliterate:
            actual=process_image(b'private-image','cnic')
        vision.assert_not_called()
        transliterate.assert_not_called()
        self.assertEqual(actual['parsed']['cnicNumber'],'11111-1111111-1')
        for field in ['name','fullName','fatherName','fatherHusbandName','dateOfIssue','dateOfExpiry']:
            self.assertEqual(actual['parsed'][field],'')
        self.assertEqual(actual['quality']['nameRecognition']['name'],'manual_entry')
        self.assertEqual(actual['timing']['nameRecognitionMs'],0)
        self.assertEqual(actual['timing']['transliterationMs'],0)
        self.assertTrue(actual['quality']['needsReview'])

    def test_old_scan_without_valid_number_requires_retake(self):
        image=np.zeros((1260,2000,3),np.uint8)
        result={'text':['01.01.2000'],'results':[]}
        with patch('app.pipeline.decode_image',return_value=image), \
             patch('app.pipeline.orient_image',return_value=(image,0)), \
             patch('app.pipeline.run_ocr',return_value=result), \
             patch('app.pipeline.detect_cnic_format',return_value='old'), \
             patch('app.pipeline.parse_cnic_fields',return_value={'cnic':'','dateOfBirth':'2000-01-01'}):
            with self.assertRaises(InvalidImage) as failure:process_image(b'synthetic','cnic')
        self.assertEqual(failure.exception.status_code,422)
        self.assertIn('CNIC number',str(failure.exception))


if __name__=="__main__":unittest.main()
