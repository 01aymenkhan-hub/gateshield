"""Bounded real-image benchmark. Run on the VPS; reports contain private data.

Three uncached sequential repeats, then three synchronized requests in each
batch. Worker timestamps prove inference overlap independently of HTTP timing.
No database writes, cloud runners, image caches or recognition mocks.
"""
import argparse
import concurrent.futures
import io
import json
from pathlib import Path
import statistics
import threading
import time

from PIL import Image, ImageEnhance
import requests

from .fixtures import SMART, NEWER_DLS, OLD


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('--url',required=True)
    cli.add_argument('--old-cnic',type=Path,required=True)
    cli.add_argument('--output',type=Path,required=True)
    cli.add_argument('--repeat',type=int,default=3)
    args=cli.parse_args()
    root=Path(__file__).resolve().parents[1]
    fixtures={
        'smart':('cnic',(root/'samples/smart_cnic.jpg').read_bytes(),SMART),
        'licence':('dls',(root/'samples/dls_newer.jpg').read_bytes(),NEWER_DLS),
        'old':('cnic',args.old_cnic.read_bytes(),OLD),
    }
    report={'url':args.url,'sequential':[],'batches':[],'oldVariants':[]}
    args.output.parent.mkdir(parents=True,exist_ok=True)

    def save():args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')

    def scan(label,barrier=None):
        document,raw,gold=fixtures[label]
        if barrier:barrier.wait(timeout=10)
        start=time.perf_counter()
        res=requests.post(args.url+'/scan-'+document,files={'file':(label+'.jpg',raw,'image/jpeg')},timeout=90)
        seconds=time.perf_counter()-start
        body=res.json();parsed=body.get('parsed',{});timing=body.get('timing',{})
        fields={key:parsed.get(key)==value for key,value in gold.items() if key!='cnicIdentification'}
        passed=res.status_code==200 and all(fields.values())
        if label.startswith('old'):
            passed=passed and timing.get('nameRecognitionMs')==0 and timing.get('transliterationMs')==0 and body.get('quality',{}).get('nameRecognition',{}).get('name')=='manual_entry'
        return {'fixture':label,'status':res.status_code,'seconds':round(seconds,4),
                'fieldChecks':fields,'passed':bool(passed),'timing':timing,'response':body}

    for i in range(args.repeat):
        for label in ['smart','licence','old']:
            row=scan(label);report['sequential'].append(row);save()
            print(json.dumps({'phase':'sequential','repeat':i+1,**{k:v for k,v in row.items() if k in ('fixture','seconds','passed')}}),flush=True)

    for pattern in [('smart','licence','old'),('old','old','old'),('smart','smart','smart'),('licence','licence','licence')]:
        for i in range(args.repeat):
            barrier=threading.Barrier(3)
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                jobs=[pool.submit(scan,label,barrier) for label in pattern]
                time.sleep(.2)
                t=time.perf_counter();health=requests.get(args.url+'/',timeout=3);health_s=time.perf_counter()-t
                rows=[job.result() for job in jobs]
            timings=[row['timing'] for row in rows]
            pids={t.get('workerId') for t in timings}
            overlap_ms=(min(t.get('workerFinishedNs',0) for t in timings)-max(t.get('workerStartedNs',0) for t in timings))/1e6
            batch={'pattern':list(pattern),'repeat':i+1,'rows':rows,'distinctWorkers':len(pids),
                   'threeWayOverlapMs':round(overlap_ms,3),'healthSeconds':round(health_s,4),
                   'passed':all(row['passed'] for row in rows) and len(pids)==3 and overlap_ms>0 and health.status_code==200 and health_s<1}
            report['batches'].append(batch);save()
            print(json.dumps({k:v for k,v in batch.items() if k!='rows'}),flush=True)

    image=Image.open(io.BytesIO(fixtures['old'][1])).convert('RGB')
    small=image.copy();small.thumbnail((1200,1200))
    variants=[('rotate180',image.transpose(Image.Transpose.ROTATE_180)),('rotate90',image.transpose(Image.Transpose.ROTATE_90)),
              ('dark',ImageEnhance.Brightness(image).enhance(.65)),('resized1200',small),('jpeg50',image)]
    for label,variant in variants:
        raw=io.BytesIO();variant.save(raw,format='JPEG',quality=50 if label=='jpeg50' else 90)
        key='old-'+label;fixtures[key]=('cnic',raw.getvalue(),OLD)
        row=scan(key);report['oldVariants'].append(row);save()
        print(json.dumps({'phase':'old-variant',**{k:v for k,v in row.items() if k in ('fixture','seconds','passed')}}),flush=True)

    report['summary']={
        'sequentialMedianSeconds':{label:round(statistics.median(row['seconds'] for row in report['sequential'] if row['fixture']==label),4) for label in ['smart','licence','old']},
        'parallelMedianSeconds':{label:round(statistics.median(row['seconds'] for batch in report['batches'] for row in batch['rows'] if row['fixture']==label),4) for label in ['smart','licence','old']},
        'batchesPassed':sum(b['passed'] for b in report['batches']),
        'batchesTotal':len(report['batches']),
        'requests':len(report['sequential'])+sum(len(b['rows']) for b in report['batches'])+len(report['oldVariants']),
        'failedRequests':sum(not row['passed'] for row in report['sequential']+report['oldVariants']+[r for b in report['batches'] for r in b['rows']]),
    }
    save();print(json.dumps(report['summary']),flush=True)
    return int(report['summary']['failedRequests']>0 or report['summary']['batchesPassed']!=len(report['batches']))


if __name__=='__main__':raise SystemExit(main())
