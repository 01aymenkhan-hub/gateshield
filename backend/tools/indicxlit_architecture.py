# Derived from AI4Bharat IndicXlit/Fairseq transformer inference (MIT).
# Export-only helper, never imported by the application.
import torch,torch.nn as nn,torch.nn.functional as F,math,argparse,json,time
from pathlib import Path
ROOT=Path(__file__).parent
class Weights(nn.Module):
 def __init__(self,state):
  super().__init__();self.p=nn.ParameterDict({k.replace('.','_'):nn.Parameter(v,requires_grad=False) for k,v in state.items() if not k.endswith(('version','_float_tensor'))});half=128;freq=torch.exp(torch.arange(half)*(-math.log(10000)/(half-1)));angles=torch.arange(1026).unsqueeze(1)*freq.unsqueeze(0);pe=torch.cat((angles.sin(),angles.cos()),1);pe[1]=0;self.register_buffer('positions',pe)
 def weight(self,k):return self.p[k.replace('.','_')]
 def linear(self,x,k):return F.linear(x,self.weight(k+'.weight'),self.p.get((k+'.bias').replace('.','_')))
 def norm(self,x,k):return F.layer_norm(x,(256,),self.weight(k+'.weight'),self.weight(k+'.bias'),1e-5)
 def embed(self,tokens,kind):
  mask=tokens.ne(1);positions=mask.long().cumsum(1)*mask.long()+1;x=F.embedding(tokens,self.weight(kind+'.embed_tokens.weight'))*16+self.positions[positions];return self.norm(x,kind+'.layernorm_embedding')
 def attention(self,q,k,v,prefix,pad,causal=False):
  B,T,_=q.shape;S=k.shape[1]
  q=self.linear(q,prefix+'.q_proj').reshape(B,T,4,64).transpose(1,2)/8
  k=self.linear(k,prefix+'.k_proj').reshape(B,S,4,64).transpose(1,2)
  v=self.linear(v,prefix+'.v_proj').reshape(B,S,4,64).transpose(1,2)
  scores=(q@k.transpose(-1,-2)).masked_fill(pad[:,None,None,:],float('-inf'))
  if causal:scores=scores+torch.triu(torch.full((T,S),float('-inf'),device=q.device),1)
  return self.linear((scores.softmax(-1)@v).transpose(1,2).reshape(B,T,256),prefix+'.out_proj')
 def feed(self,x,p):return x+self.linear(F.gelu(self.linear(self.norm(x,p+'.final_layer_norm'),p+'.fc1')),p+'.fc2')
class Encoder(Weights):
 def forward(self,src):
  x=self.embed(src,'encoder')*src.ne(1).unsqueeze(-1);pad=src.eq(1)
  for i in range(6):
   p=f'encoder.layers.{i}';z=self.norm(x,p+'.self_attn_layer_norm');x=x+self.attention(z,z,z,p+'.self_attn',pad);x=self.feed(x,p)
  return self.norm(x,'encoder.layer_norm')
class Decoder(Weights):
 def forward(self,tgt,enc,src):
  x=self.embed(tgt,'decoder')
  for i in range(6):
   p=f'decoder.layers.{i}';z=self.norm(x,p+'.self_attn_layer_norm');x=x+self.attention(z,z,z,p+'.self_attn',tgt.eq(1),True);z=self.norm(x,p+'.encoder_attn_layer_norm');x=x+self.attention(z,enc,enc,p+'.encoder_attn',src.eq(1));x=self.feed(x,p)
  return self.linear(self.norm(x,'decoder.layer_norm')[:,-1,:],'decoder.output_projection')
def load():
 with torch.serialization.safe_globals([argparse.Namespace]):b=torch.load(ROOT/'indic-model/transformer/indicxlit.pt',map_location='cpu',weights_only=True)
 state=b['model'];return Encoder(state).eval(),Decoder(state).eval()
def vocabulary(name):
 tokens=['<s>','<pad>','</s>','<unk>']+[x.rsplit(' ',1)[0] for x in (ROOT/'indic-model/corpus-bin'/('dict.'+name+'.txt')).read_text(encoding='utf8').splitlines()]
 tokens+=['__'+s+'__' for s in (ROOT/'lang_list.txt').read_text().split()];return tokens
