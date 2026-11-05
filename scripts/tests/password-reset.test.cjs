const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,mocks={}) {
  const module={exports:{}};
  const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const context={module,exports:module.exports,require:name=>name in mocks?mocks[name]:require(name),process,Buffer,console,Date,Map,setTimeout};
  vm.runInNewContext(source,context,{filename:path.join(root,file)});
  return module.exports;
}
const helper=()=>load('src/lib/passwordReset.ts',{'@/lib/prisma':{}});
test('tokens are random, hashed and request-scoped',()=>{
  const h=helper(),a=h.generateSecureRandomToken(),b=h.generateSecureRandomToken();
  assert.equal(a.length,64);assert.notEqual(a,b);assert.equal(h.hashToken(a).length,64);assert.notEqual(h.hashToken(a),a);
  const params={requestId:'request-a',userId:'user-a',approvedAtIso:'2026-11-05T00:00:00Z'};
  assert.equal(h.deriveResetAuthorizationToken(params),h.deriveResetAuthorizationToken(params));
  assert.notEqual(h.deriveResetAuthorizationToken(params),h.deriveResetAuthorizationToken({...params,userId:'other'}));
});
test('email tickets reject tampering, malformed payloads and expiration',()=>{
  const h=helper(),params={requestId:'a',userId:'b',expiresAtMs:Date.now()+60000};
  const ticket=h.createEmailExchangeTicket(params),verified=h.verifyEmailExchangeTicket(ticket);
  assert.equal(verified.requestId,'a');assert.equal(verified.userId,'b');
  for(const invalid of ['bad',ticket+'x','x.'+ticket.split('.')[1],h.createEmailExchangeTicket({...params,expiresAtMs:1})]) assert.equal(h.verifyEmailExchangeTicket(invalid),null);
});
test('ticket is expired at the exact expiry instant',()=>{
  const h=helper(),now=Date.now(),original=Date.now;
  Date.now=()=>now;
  try {assert.equal(h.verifyEmailExchangeTicket(h.createEmailExchangeTicket({requestId:'a',userId:'b',expiresAtMs:now})),null);}
  finally {Date.now=original;}
});
test('rate limit isolates clients and expires after the window',()=>{
  const h=helper();for(let i=0;i<6;i++)assert.equal(h.checkPasswordResetRateLimit('a').allowed,true);
  assert.equal(h.checkPasswordResetRateLimit('a').allowed,false);assert.equal(h.checkPasswordResetRateLimit('b').allowed,true);
  const now=Date.now;Date.now=()=>now()+601000;
  try {assert.equal(h.checkPasswordResetRateLimit('a').allowed,true);}finally{Date.now=now;}
});
test('expiry configuration validates bounds',()=>{
  const h=helper(),old=process.env.PASSWORD_RESET_EXPIRY_MINUTES;
  try {for(const [raw,want]of [['3',30],['invalid',30],['1441',30],['5',5],['60',60]]){process.env.PASSWORD_RESET_EXPIRY_MINUTES=raw;assert.equal(h.getResetExpiryMinutes(),want);}}
  finally {if(old===undefined)delete process.env.PASSWORD_RESET_EXPIRY_MINUTES;else process.env.PASSWORD_RESET_EXPIRY_MINUTES=old;}
});
function requestHarness(ownerToken,options={}) {
  const h=helper(),writes=[],user={id:'user-a',email:'user@example.invalid',name:'User A',role:'OPERATOR',active:true,approvalStatus:'APPROVED'};
  const active={id:'reset-a',status:'APPROVED',expiresAt:new Date(Date.now()+60000),trackerTokenHash:h.hashToken('original-owner-token')};
  const db={$queryRaw:async sql=>{if(options.dbError)throw Error('synthetic DB failure');return sql.join('').includes('FROM "users"')?(options.missingUser?[]:[user]):(options.newRequest?[]:[active]);},$executeRaw:async(...args)=>{writes.push(args);return 1;}};
  const makeResponse=data=>({data,cookies:{values:{},set(name,value){this.values[name]=value;},delete(){}}});
  const route=load('src/app/api/auth/password-reset/request/route.ts',{
    'next/server':{NextResponse:{json:makeResponse}},'next/headers':{cookies:async()=>({get:()=>ownerToken?{value:ownerToken}:undefined})},
    '@/lib/prisma':db,'@/lib/passwordReset':{...h,checkPasswordResetRateLimit:()=>({allowed:!options.limited,retryAfterSeconds:30}),ensurePasswordResetSchema:async()=>{},expireStalePasswordResetRequests:async()=>{}},
    '@/lib/notifications':{createAppNotification:async()=>{}},'@/lib/audit':{logAudit:async()=>{}},'@/lib/emailService':{sendAdminPasswordResetRequestEmail:async()=>{}}
  });
  return {route,writes,h,request:{headers:{get:()=> 'test-client'},json:async()=>({email:options.badEmail?'bad':user.email,portalContext:'OPERATOR'})}};
}
test('a second browser cannot replace the tracker of an approved reset',async()=>{
  const x=requestHarness();const res=await x.route.POST(x.request);
  assert.equal(x.writes.length,0,'anonymous duplicate request must not transfer reset ownership');
  assert.equal(res.data.status,'PENDING');assert.equal(res.data.duplicatePrevented,undefined,'duplicate response must not reveal account existence');
});
test('the original browser keeps its existing tracker on repeat request',async()=>{
  const x=requestHarness('original-owner-token');const res=await x.route.POST(x.request);
  assert.equal(res.cookies.values[x.h.RESET_TRACKER_COOKIE],'original-owner-token');
  assert.equal(x.writes.length,0);
});
test('valid fresh request creates one record and returns an opaque tracker',async()=>{
  const x=requestHarness(undefined,{newRequest:true}),res=await x.route.POST(x.request);
  assert.equal(res.data.success,true);assert.equal(x.writes.length,1);assert.equal(res.cookies.values[x.h.RESET_TRACKER_COOKIE].length,64);
});
test('unknown email receives the same generic success and a dummy tracker',async()=>{
  const x=requestHarness(undefined,{missingUser:true}),res=await x.route.POST(x.request);
  assert.equal(res.data.success,true);assert.equal(res.data.status,'PENDING');assert.equal(x.writes.length,0);
});
test('invalid input and rate limits prevent any write',async()=>{
  for(const option of [{badEmail:true},{limited:true},{dbError:true}]){
    const x=requestHarness(undefined,option),res=await x.route.POST(x.request);
    assert.ok(res.data.error);assert.equal(x.writes.length,0);
  }
});
test('schema initialization is idempotent and expiry cleanup executes',async()=>{
  const statements=[];
  const h=load('src/lib/passwordReset.ts',{'@/lib/prisma':{$executeRawUnsafe:async sql=>{statements.push(sql);return 0;},$executeRaw:async sql=>{statements.push(sql.join(''));return 0;}}});
  await h.ensurePasswordResetSchema();const count=statements.length;assert.ok(count>=7);
  await h.ensurePasswordResetSchema();assert.equal(statements.length,count);
  await h.expireStalePasswordResetRequests();assert.equal(statements.length,count+1);
});
test('password changes revoke a session issued one second earlier',async()=>{
  const now=Date.now(),decoded={id:'u',email:'u@example.invalid',name:'Test',role:'OPERATOR',iat:Math.floor((now-1000)/1000)};
  const auth=load('src/lib/auth.ts',{
    'next/headers':{cookies:async()=>({get:()=>({value:'signed-test-token'})})},
    './prisma':{$queryRaw:async()=>[{...decoded,active:true,approvalStatus:'APPROVED',passwordChangedAt:new Date(now)}]},
    './passwordReset':{ensurePasswordResetSchema:async()=>{}},
    'jsonwebtoken':{verify:()=>decoded},
  });
  assert.equal(await auth.getSessionUser(),null);
});
