"""Bounded two-installation benchmark; execute on the VPS, keep reports private."""
import argparse
from collections import defaultdict
import concurrent.futures
import json
from pathlib import Path
import statistics
import subprocess
import threading
import time

import requests

from .fixtures import SMART, NEWER_DLS, OLD


def percentile(values, fraction):
    ordered=sorted(values)
    return ordered[min(len(ordered)-1,round((len(ordered)-1)*fraction))] if ordered else 0


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('--urls',nargs=2,required=True)
    cli.add_argument('--services',nargs=2,default=['gateshield-ocr','gateshield2-ocr'])
    cli.add_argument('--workers',type=int,required=True)
    cli.add_argument('--old-cnic',type=Path,required=True)
    cli.add_argument('--output',type=Path,required=True)
    args=cli.parse_args()
    root=Path(__file__).resolve().parents[1]
    cases={'smart':('cnic',(root/'samples/smart_cnic.jpg').read_bytes(),SMART),
           'licence':('dls',(root/'samples/dls_newer.jpg').read_bytes(),NEWER_DLS),
           'old':('cnic',args.old_cnic.read_bytes(),OLD)}
    cores=__import__('os').cpu_count()
    groups={service:Path('/sys/fs/cgroup'+subprocess.check_output(['systemctl','show',service,'-p','ControlGroup','--value'],text=True).strip()) for service in args.services}
    stop=threading.Event();samples=[];current_phase=['idle']
    report={'workersPerOcr':args.workers,'cpuCores':cores,'urls':args.urls,'rows':[],'batches':[]}
    args.output.parent.mkdir(parents=True,exist_ok=True)

    def save():args.output.write_text(json.dumps(report,indent=2),encoding='utf8')

    def snapshot():
        cpu=list(map(int,Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
        mem={line.split(':')[0]:int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.split()[1].isdigit()}
        return {'time':time.perf_counter(),'cpu':cpu,'usedBytes':mem['MemTotal']-mem['MemAvailable'],'availableBytes':mem['MemAvailable'],
                'services':{service:{'memoryBytes':int((path/'memory.current').read_text()),'cpuUsec':int(dict(line.split() for line in (path/'cpu.stat').read_text().splitlines())['usage_usec'])} for service,path in groups.items()}}

    def monitor():
        previous=snapshot()
        while not stop.wait(.2):
            current=snapshot();delta=[a-b for a,b in zip(current['cpu'],previous['cpu'])];total=sum(delta);elapsed=current['time']-previous['time']
            current['cpuPercent']=100*(total-delta[3]-delta[4])/total if total else 0
            current['stealPercent']=100*delta[7]/total if total else 0
            for service in groups:
                current['services'][service]['cpuPercentOfServer']=(current['services'][service]['cpuUsec']-previous['services'][service]['cpuUsec'])/1e6/elapsed/cores*100
            current['phase']=current_phase[0]
            samples.append(current);previous=current

    def scan(installation,label,barrier=None,phase='sequential'):
        document,raw,gold=cases[label]
        if barrier:barrier.wait(timeout=10)
        started=time.perf_counter();res=requests.post(args.urls[installation]+'/scan-'+document,files={'file':(label+'.jpg',raw,'image/jpeg')},timeout=90);body=res.json();parsed=body.get('parsed',{});timing=body.get('timing',{})
        checks={key:parsed.get(key)==value for key,value in gold.items() if key!='cnicIdentification'}
        passed=res.status_code==200 and all(checks.values())
        if label=='old':passed=passed and timing.get('nameRecognitionMs')==0 and timing.get('transliterationMs')==0
        return {'installation':installation+1,'fixture':label,'phase':phase,'status':res.status_code,'seconds':round(time.perf_counter()-started,4),'passed':bool(passed),'fieldChecks':checks,'timing':timing}

    for url in args.urls:
        health=requests.get(url+'/',timeout=5).json()
        assert health['workers']==args.workers,health
    # Warm each instance with the actual three fixture types, record separately.
    report['warmup']=[scan(app,label,phase='warmup') for app in range(2) for label in cases]
    assert all(row['passed'] for row in report['warmup'])
    report['idle']=snapshot()
    sampler=threading.Thread(target=monitor,daemon=True);sampler.start()
    try:
        time.sleep(2)
        current_phase[0]='sequential'
        for repeat in range(3):
            for app in range(2):
                for label in cases:
                    row=scan(app,label);row['repeat']=repeat+1;report['rows'].append(row);save()
                    print(json.dumps({k:row[k] for k in ['installation','fixture','phase','seconds','passed']}),flush=True)
        patterns=[('two-mixed',[(0,'smart'),(1,'old')]),
                  ('four-mixed',[(0,'smart'),(0,'old'),(1,'licence'),(1,'smart')]),
                  ('four-old',[(0,'old'),(0,'old'),(1,'old'),(1,'old')])]
        for name,pattern in patterns:
            current_phase[0]=name
            for repeat in range(3):
                if samples and samples[-1]['availableBytes']<1024**3:raise RuntimeError('Stopping bounded load: less than 1 GiB memory available')
                barrier=threading.Barrier(len(pattern))
                with concurrent.futures.ThreadPoolExecutor(max_workers=len(pattern)) as pool:
                    jobs=[pool.submit(scan,app,label,barrier,name) for app,label in pattern]
                    time.sleep(.2)
                    t=time.perf_counter();health=[requests.get(url+'/',timeout=3).status_code for url in args.urls];health_s=time.perf_counter()-t
                    rows=[job.result() for job in jobs]
                events=[]
                for row in rows:
                    t=row['timing'];events.extend([(t['workerStartedNs'],1),(t['workerFinishedNs'],-1)])
                active=peak=0
                for _,change in sorted(events):active+=change;peak=max(peak,active)
                expected=min(len(rows),args.workers*2)
                batch={'pattern':name,'repeat':repeat+1,'rows':rows,'batchSeconds':max(row['seconds'] for row in rows),'peakInferenceOverlap':peak,'expectedOverlap':expected,'distinctWorkers':len({row['timing']['workerId'] for row in rows}),'healthSeconds':round(health_s,4),'passed':all(row['passed'] for row in rows) and peak==expected and all(status==200 for status in health) and health_s<1}
                report['batches'].append(batch);save();print(json.dumps({k:v for k,v in batch.items() if k!='rows'}),flush=True)
    finally:
        stop.set();sampler.join(timeout=3)
        report['resources']={'samples':len(samples),'systemCpuAveragePercent':round(statistics.mean(s['cpuPercent'] for s in samples),2),'systemCpuP95Percent':round(percentile([s['cpuPercent'] for s in samples],.95),2),'systemCpuPeakPercent':round(max(s['cpuPercent'] for s in samples),2),'stealPeakPercent':round(max(s['stealPercent'] for s in samples),2),'systemUsedPeakGiB':round(max(s['usedBytes'] for s in samples)/1024**3,3),'systemAvailableMinimumGiB':round(min(s['availableBytes'] for s in samples)/1024**3,3),'services':{service:{'peakGiB':round(max(s['services'][service]['memoryBytes'] for s in samples)/1024**3,3),'cpuAveragePercentOfServer':round(statistics.mean(s['services'][service]['cpuPercentOfServer'] for s in samples),2)} for service in groups}}
        allrows=report['rows']+[row for batch in report['batches'] for row in batch['rows']]
        report['summary']={'requests':len(allrows),'failedRequests':sum(not row['passed'] for row in allrows),'batchesPassed':sum(batch['passed'] for batch in report['batches']),'batchesTotal':len(report['batches']),
                           'latency':{phase:{'medianSeconds':round(statistics.median(row['seconds'] for row in allrows if row['phase']==phase),4),'p95Seconds':round(percentile([row['seconds'] for row in allrows if row['phase']==phase],.95),4),'maximumSeconds':max(row['seconds'] for row in allrows if row['phase']==phase)} for phase in ['sequential','two-mixed','four-mixed','four-old'] if any(row['phase']==phase for row in allrows)}}
        report['resources']['byPhase']={phase:{'cpuAveragePercent':round(statistics.mean(s['cpuPercent'] for s in samples if s['phase']==phase),2),'cpuPeakPercent':round(max(s['cpuPercent'] for s in samples if s['phase']==phase),2),'usedPeakGiB':round(max(s['usedBytes'] for s in samples if s['phase']==phase)/1024**3,3)} for phase in set(s['phase'] for s in samples)}
        report['samples']=samples;save()
    print(json.dumps({'summary':report['summary'],'resources':report['resources']}),flush=True)
    return int(report['summary']['failedRequests']>0 or report['summary']['batchesPassed']!=report['summary']['batchesTotal'])


if __name__=='__main__':raise SystemExit(main())
