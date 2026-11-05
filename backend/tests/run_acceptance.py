"""Real API image/field/timing tests. Run from backend: python -m tests.run_acceptance.

No cache/dedup shortcuts: every repeat sends the file through actual inference.
Reports contain sample identity data, so write them to a private output directory.
"""
import argparse
import concurrent.futures
import io
import json
import statistics
import time
from pathlib import Path

import requests
from PIL import Image, ImageEnhance, ImageFilter

from .fixtures import FIXTURES, SMART, NEWER_DLS

ROOT = Path(__file__).resolve().parents[1]


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('--url', default='http://127.0.0.1:8000')
    cli.add_argument('--repeat',type=int,default=3)
    cli.add_argument('--output',type=Path,required=True)
    cli.add_argument('--variants',action='store_true')
    cli.add_argument('--old-cnic',type=Path,help='Private old-card sample path, when kept outside the checkout.')
    args=cli.parse_args()
    if args.repeat < 1:
        cli.error('--repeat must be positive')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    rows=[]

    def save():
        args.output.write_text(json.dumps(rows,indent=2,ensure_ascii=False),encoding='utf-8')

    def scan(label,document,raw,filename,expected=None,iteration=1,expected_status=200,allow_review=False):
        start=time.perf_counter()
        res=requests.post(args.url+'/scan-'+document,files={'file':(filename,raw,'image/jpeg')},timeout=120)
        body=res.json()
        row={'fixture':label,'iteration':iteration,'status':res.status_code,
             'seconds':round(time.perf_counter()-start,4),'response_bytes':len(res.content),
             'response':body, 'passed':res.status_code==expected_status}
        if expected and res.status_code==200:
            checks={k:str(body['parsed'].get(k,'')).casefold()==v.casefold() for k,v in expected.items()}
            row.update(field_checks=checks,matched_fields=sum(checks.values()),expected_fields=len(checks),all_fields_match=all(checks.values()))
            if label=='samples/old-cnic-pic.jpg':
                # The old fixture previously passed names via a hardcoded lookup.
                # Score ALL gold fields, but require honest review plus real core data.
                required=('fullName','fatherHusbandName','cnicNumber','dateOfBirth','gender','dateOfIssue','dateOfExpiry')
                row['passed'] &= all(checks[k] for k in required) and body['quality']['needsReview']
                row['passed'] &= body['quality']['nameRecognition'].get('name')=='manual_entry' and body['timing']['nameRecognitionMs']==0 and body['timing']['transliterationMs']==0
                row['limitation']='Old-CNIC names require manual entry by design; exact CNIC, DOB and gender are required. Front-side issue/expiry remain empty.'
            elif label=='samples/dls_older.jpg':
                core_checks=[value for key,value in checks.items() if key!='licensingAuthority']
                row['passed'] &= all(core_checks) and (all(checks.values()) or body['quality']['needsReview'])
                if not all(checks.values()):
                    row['limitation']='Small authority text needs operator review; exact field mismatch is reported, not counted as correct.'
                    row['handled_with_review']=True
            elif allow_review and not all(checks.values()):
                row['passed'] &= body['quality']['needsReview']
                row['handled_with_review']=bool(body['quality']['needsReview'])
            else:
                row['passed'] &= all(checks.values())
        elif expected:
            row['passed']=False
        rows.append(row);save()
        print(json.dumps({k:v for k,v in row.items() if k not in ('response','field_checks')},ensure_ascii=True),flush=True)
        return row

    for iteration in range(1,args.repeat+1):
        for filename,document,expected in FIXTURES:
            path=args.old_cnic if filename=='samples/old-cnic-pic.jpg' and args.old_cnic else ROOT/filename
            scan(filename,document,path.read_bytes(),Path(filename).name,expected,iteration)

    for document in ('cnic','dls'):
        scan('empty-'+document,document,b'','empty.jpg',expected_status=400)
        scan('corrupt-'+document,document,b'bad image','corrupt.jpg',expected_status=400)
        scan('unsupported-'+document,document,b'bad','bad.txt',expected_status=400)
        blank=io.BytesIO();Image.new('RGB',(1000,630),'white').save(blank,format='PNG')
        scan('blank-'+document,document,blank.getvalue(),'blank.png',expected_status=422)
        scan('oversized-'+document,document,b'a'*(15*1024*1024+1),'large.jpg',expected_status=413)
        start=time.perf_counter();r=requests.post(args.url+'/scan-'+document,timeout=10)
        rows.append({'fixture':'missing-'+document,'status':r.status_code,'seconds':round(time.perf_counter()-start,4),'passed':r.status_code==422});save()

    scan('wrong-document-dls','dls',(ROOT/'samples/smart_cnic.jpg').read_bytes(),'cnic.jpg',expected_status=422)
    scan('wrong-document-cnic','cnic',(ROOT/'samples/dls_newer.jpg').read_bytes(),'dls.jpg',expected_status=422)
    scan('cnic-back','cnic',(ROOT/'samples/cnic_back.jpg').read_bytes(),'back.jpg')
    back=rows[-1]
    # A back side may yield partial ID data, but must never be shown as complete.
    back['passed']=back['status']==422 or (back['status']==200 and back['response']['quality']['needsReview'])
    save()

    if args.variants:
        for filename,document,expected in FIXTURES:
            if filename not in ('samples/smart_cnic.jpg','samples/dls_newer.jpg','samples/dls_older.jpg'):
                continue
            image=Image.open(ROOT/filename).convert('RGB')
            variants={
                'rotate90':image.transpose(Image.Transpose.ROTATE_90),
                'rotate180':image.transpose(Image.Transpose.ROTATE_180),
                'dark':ImageEnhance.Brightness(image).enhance(.65),
                'jpeg50':image,
                'mild-blur':image.filter(ImageFilter.GaussianBlur(.5)),
            }
            for label,variant in variants.items():
                raw=io.BytesIO();variant.save(raw,format='JPEG',quality=50 if label=='jpeg50' else 95)
                scan(filename+':'+label,document,raw.getvalue(),'variant.jpg',expected,allow_review=True)

    # Health responsiveness during REAL inference, not a fake sleeping handler.
    def actual_scan():
        start=time.perf_counter()
        r=requests.post(args.url+'/scan-cnic',files={'file':('smart.jpg',(ROOT/'samples/smart_cnic.jpg').read_bytes(),'image/jpeg')},timeout=120)
        return {'status':r.status_code,'seconds':round(time.perf_counter()-start,4),'queue_ms':r.json().get('timing',{}).get('queueMs')}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs=[pool.submit(actual_scan),pool.submit(actual_scan)]
        time.sleep(.4)
        start=time.perf_counter();health=requests.get(args.url+'/',timeout=3)
        health_seconds=time.perf_counter()-start
        scans=[j.result() for j in jobs]
    rows.append({'fixture':'concurrency-health','scans':scans,'health_seconds':round(health_seconds,4),
                 'passed':health.status_code==200 and health_seconds < 1 and all(x['status']==200 for x in scans)})
    save()
    summary={'requests':len(rows),'passed':sum(x['passed'] for x in rows),'failed':sum(not x['passed'] for x in rows)}
    print(json.dumps(summary),flush=True)
    return int(bool(summary['failed']))


if __name__=='__main__':
    raise SystemExit(main())
