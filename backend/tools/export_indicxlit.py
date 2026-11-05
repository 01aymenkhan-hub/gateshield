from pathlib import Path
import argparse,json,hashlib
import torch,numpy as np,onnxruntime as ort
import indicxlit_architecture as m
cli=argparse.ArgumentParser(description='Export reviewed IndicXlit v1.0 weights; synthetic numeric verification only.')
cli.add_argument('--model-root',type=Path,required=True,help='Contains indic-model/{corpus-bin,transformer} and lang_list.txt from official release.')
cli.add_argument('--output',type=Path,required=True)
args=cli.parse_args();m.ROOT=args.model_root
torch.set_num_threads(2);enc,dec=m.load();out=args.output;out.mkdir(parents=True,exist_ok=True)
src=torch.tensor([[805,10,11,12,2]],dtype=torch.long);tgt=torch.tensor([[2,5,6]],dtype=torch.long)
with torch.no_grad():
 e=enc(src)
 torch.onnx.export(enc,(src,),out/'encoder.onnx',input_names=['source'],output_names=['encoded'],dynamic_axes={'source':{0:'batch',1:'source_length'},'encoded':{0:'batch',1:'source_length'}},opset_version=17,dynamo=False)
 torch.onnx.export(dec,(tgt,e,src),out/'decoder.onnx',input_names=['target','encoded','source'],output_names=['logits'],dynamic_axes={'target':{0:'batch',1:'target_length'},'encoded':{0:'batch',1:'source_length'},'source':{0:'batch',1:'source_length'},'logits':{0:'batch'}},opset_version=17,dynamo=False)
opt=ort.SessionOptions();opt.intra_op_num_threads=2
es=ort.InferenceSession(str(out/'encoder.onnx'),opt,providers=['CPUExecutionProvider']);ds=ort.InferenceSession(str(out/'decoder.onnx'),opt,providers=['CPUExecutionProvider'])
checks=[]
for source,target in [([[805,10,11,12,2]],[[2,5,6]]),([[805,20,30,40,50,60,2]],[[2,8,12,5,6]]),([[805,15,2],[805,16,2]],[[2,7],[2,8]])]:
 s=torch.tensor(source);t=torch.tensor(target)
 with torch.no_grad():e=enc(s);d=dec(t,e,s)
 oe=es.run(None,{'source':s.numpy()})[0];od=ds.run(None,{'source':s.numpy(),'encoded':oe,'target':t.numpy()})[0]
 delta=float(np.max(np.abs(od-d.numpy())));assert delta<.0001,delta;checks.append(delta)
vocab={'source':m.vocabulary('ur'),'target':m.vocabulary('en')};(out/'vocabulary.json').write_text(json.dumps(vocab,ensure_ascii=False),encoding='utf8')
manifest={'source':'https://github.com/AI4Bharat/IndicXlit','release':'v1.0 indic-en','source_archive_sha256':'420d23a13cfa953edfb47644bc805de06e97134f25e6d182303a29f55b5a3322','license':'MIT','onnx_torch_max_error':checks,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8');print(json.dumps(manifest))
