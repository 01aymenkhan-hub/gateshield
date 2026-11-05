"""Extra real local/private-fixture checks for old-CNIC names. No cloud OCR.

--private-dir contains generated independent-name/blank-name test PNGs.
Results contain personal data; --output must be a private path.
"""
import argparse
import io
import json
import re
import time
from pathlib import Path

import requests
from PIL import Image, ImageEnhance

from .fixtures import OLD


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('--url',required=True)
    cli.add_argument('--private-dir',type=Path,required=True)
    cli.add_argument('--output',type=Path,required=True)
    cli.add_argument('--font',choices=['nastaliq','arial'],default='nastaliq')
    cli.add_argument('--source',type=Path,help='Private old-card source outside the checkout.')
    args=cli.parse_args()
    root=Path(__file__).resolve().parents[1]
    source=Image.open(args.source or root/'samples/old-cnic-pic.jpg').convert('RGB')
    cases=[]
    originals=[
        ('different-name-1','حسن علی','محمد اسلم'),
        ('different-name-2','بلال احمد','محمد اقبال'),
        ('unknown-english','احسن افتخار','جاوید اقبال'),
        ('blank-name','','محمد اقبال'),
    ]
    aliases={'different-name-1':'nastaliq-name-1','different-name-2':'nastaliq-name-2',
             'unknown-english':'nastaliq-unknown','blank-name':'nastaliq-blank'}
    for filename,name,father in originals:
        if args.font=='nastaliq':filename=aliases[filename]
        cases.append((filename,(args.private_dir/(filename+'.png')).read_bytes(),name,father))
    resized=source.copy();resized.thumbnail((1200,1200))
    for label,image in [('resized-1200',resized),('rotate180',source.transpose(Image.Transpose.ROTATE_180)),
                        ('dark',ImageEnhance.Brightness(source).enhance(.75))]:
        raw=io.BytesIO();image.save(raw,format='JPEG',quality=85)
        cases.append((label,raw.getvalue(),OLD['fullName'],OLD['fatherHusbandName']))
    rows=[]
    for label,raw,name,father in cases:
        name=father=""
        start=time.perf_counter()
        response=requests.post(args.url+'/scan-cnic',files={'file':('old.jpg',raw,'image/jpeg')},timeout=120)
        body=response.json();parsed=body.get('parsed',{})
        checks={
            'name':parsed.get('fullName')==name,
            'father':parsed.get('fatherHusbandName')==father,
            'id_unchanged':parsed.get('cnicNumber')==OLD['cnicNumber'],
            'issue_empty':parsed.get('dateOfIssue')=='',
            'expiry_empty':parsed.get('dateOfExpiry')=='',
            'native_script':all(not value or re.fullmatch(r"[A-Za-z\u0600-\u06ff .'-]+",value) for value in (parsed.get('fullName',''),parsed.get('fatherHusbandName',''))),
        }
        # Stress cases may safely ask for manual completion, but must NEVER
        # populate a different person's name. Exact matches remain reported.
        review=body.get('quality',{}).get('needsReview',False)
        safe_names=all(parsed.get(key,'')=='' for key in ('fullName','fatherHusbandName','nameUrdu','fatherNameUrdu')) and review
        passed=response.status_code==200 and safe_names and all(v for k,v in checks.items() if k not in ('name','father'))
        row={'case':label,'status':response.status_code,'seconds':round(time.perf_counter()-start,3),
             'checks':checks,'exact_names':checks['name'] and checks['father'],
             'safe_review_handling':safe_names,'passed':passed,'response':body}
        rows.append(row);args.output.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
        print(json.dumps({k:v for k,v in row.items() if k!='response'}),flush=True)
    return int(any(not row['passed'] for row in rows))


if __name__=='__main__':raise SystemExit(main())
