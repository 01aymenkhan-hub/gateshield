/* Real HTTP + PostgreSQL checks; only generated accounts are changed and removed. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {PrismaClient}=require('@prisma/client'),{hash}=require('bcryptjs');
const prisma=new PrismaClient(),base=process.argv[2]||'http://127.0.0.1:3005';
assert.ok(new URL(process.env.DATABASE_URL).pathname.includes('candidate')||process.argv.includes('--production'));
assert.equal(process.env.EMAIL_ENABLED,'false','Synthetic tests must not send email');
const marker='ResetTest'+crypto.randomBytes(6).toString('hex'),users=[],requestIds=[],rows=[];
const password=crypto.randomBytes(24).toString('hex'),newPassword=crypto.randomBytes(24).toString('hex');
const jar=()=>new Map();
const clientIps=new WeakMap();let clientNumber=0;
async function call(route,body,cookies=jar(),method=body?'POST':'GET') {
 if(!clientIps.has(cookies))clientIps.set(cookies,'127.88.0.'+(++clientNumber));
 const res=await fetch(base+route,{method,headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),'Content-Type':'application/json','X-Forwarded-For':clientIps.get(cookies)},...(body?{body:JSON.stringify(body)}:{})});
 for(const c of res.headers.getSetCookie()){const [name,...value]=c.split(';')[0].split('=');cookies.set(name,value.join('='));}
 return {status:res.status,body:await res.json(),cookies};
}
function check(name,passed){assert.ok(passed,name);rows.push({check:name,passed:true});console.log(name);}
async function login(user,cookies=jar(),pass=password){return call(user.role==='EMPLOYEE'?'/api/employee/login':'/api/auth/login',{email:user.email,password:pass},cookies);}
async function request(user,cookies=jar()) {const r=await call('/api/auth/password-reset/request',{email:user.email,portalContext:user.role},cookies);assert.equal(r.status,200);return cookies;}
async function state(cookies){return call('/api/auth/password-reset/status',null,cookies);}
async function review(id,action,cookies){return call('/api/admin/password-resets/'+id,{action,rejectionReason:'Synthetic test rejection'},cookies,'PATCH');}
(async()=>{
 for(const role of ['ADMIN','OPERATOR','EMPLOYEE'])users.push(await prisma.user.create({data:{email:(marker+role+'@example.invalid').toLowerCase(),name:marker+role,passwordHash:await hash(password,10),role,active:true,approvalStatus:'APPROVED'}}));
 const [admin,operator,employee]=users,adminJar=jar(),opJar=jar(),empJar=jar();
 assert.equal((await login(admin,adminJar)).status,200);assert.equal((await login(operator,opJar)).status,200);assert.equal((await login(employee,empJar)).status,200);
 check('All three role logins succeed',true);
 check('Anonymous reset administration blocked',(await call('/api/admin/password-resets')).status===401);
 for(const j of [opJar,empJar])check('Non-admin reset administration blocked',(await call('/api/admin/password-resets',null,j)).status===403);
 check('Missing reset authorization blocked',(await call('/api/auth/password-reset/complete',{password:newPassword,confirmPassword:newPassword})).status===401);
 check('Invalid reset email rejected',(await call('/api/auth/password-reset/request',{email:'bad'})).status===400);
 const owner=await request(operator),pending=await state(owner),id=pending.body.requestId;requestIds.push(id);
 check('Operator request pending and cannot reset',pending.body.status==='PENDING'&&!pending.body.canResetPassword);
 check('Operator cannot approve own reset',(await review(id,'APPROVE',opJar)).status===403);
 const list=await call('/api/admin/operators',null,adminJar);
 check('Operator request appears in admin management',JSON.stringify(list.body).includes(id));
 check('Admin approves reset',(await review(id,'APPROVE',adminJar)).status===200);
 const attacker=await request(operator),attackerStatus=await state(attacker);
 check('Duplicate request cannot steal approved reset',!attackerStatus.body.canResetPassword);
 check('Attacker cannot complete reset',(await call('/api/auth/password-reset/complete',{password:newPassword,confirmPassword:newPassword},attacker)).status===403);
 check('Original browser retains approved reset',(await state(owner)).body.canResetPassword===true);
 check('Password confirmation mismatch rejected',(await call('/api/auth/password-reset/complete',{password:newPassword,confirmPassword:'mismatch'},owner)).status===400);
 const copyA=new Map(owner),copyB=new Map(owner);
 const outcomes=await Promise.all([copyA,copyB].map(j=>call('/api/auth/password-reset/complete',{password:newPassword,confirmPassword:newPassword},j)));
 check('Concurrent completion consumes authorization exactly once',outcomes.filter(x=>x.status===200).length===1&&outcomes.filter(x=>[403,409].includes(x.status)).length===1);
 check('Previous operator session revoked',(await call('/api/auth/me',null,opJar)).status===401);
 check('Old password rejected',(await login(operator)).status===401);
 const fresh=jar();check('New password and fresh session work',(await login(operator,fresh,newPassword)).status===200&&(await call('/api/auth/me',null,fresh)).status===200);
 check('Reset token replay rejected',(await call('/api/auth/password-reset/complete',{password:newPassword,confirmPassword:newPassword},new Map(owner))).status===403);
 const rejected=await request(employee),rejectedState=await state(rejected);requestIds.push(rejectedState.body.requestId);
 check('Employee request appears in admin employee view',JSON.stringify((await call('/api/admin/employees',null,adminJar)).body).includes(rejectedState.body.requestId));
 check('Admin rejection works',(await review(rejectedState.body.requestId,'REJECT',adminJar)).status===200&&(await state(rejected)).body.status==='REJECTED');
 check('Rejected reset cannot complete',(await call('/api/auth/password-reset/complete',{password:newPassword,confirmPassword:newPassword},rejected)).status===403);
 const expired=await request(employee),expiredId=(await state(expired)).body.requestId;requestIds.push(expiredId);
 assert.equal((await review(expiredId,'APPROVE',adminJar)).status,200);
 await prisma.passwordResetRequest.update({where:{id:expiredId},data:{expiresAt:new Date(Date.now()-1000)}});
 check('Expired approval cannot reset',(await state(expired)).body.status==='EXPIRED'&&(await call('/api/auth/password-reset/complete',{password:newPassword,confirmPassword:newPassword},expired)).status===403);
 const adminOwner=await request(admin),adminId=(await state(adminOwner)).body.requestId;requestIds.push(adminId);
 check('Admin security reset list available',(await call('/api/admin/password-resets',null,adminJar)).status===200);
 assert.equal((await review(adminId,'APPROVE',adminJar)).status,200);
 await state(adminOwner);check('Admin reset completes',(await call('/api/auth/password-reset/complete',{password:newPassword,confirmPassword:newPassword},adminOwner)).status===200);
 check('Previous admin session revoked',(await call('/api/auth/me',null,adminJar)).status===401);
 const unknown=jar();const unknownRes=await call('/api/auth/password-reset/request',{email:marker+'missing@example.invalid'},unknown);
 check('Unknown account returns generic pending response',unknownRes.status===200&&unknownRes.body.status==='PENDING'&&!(await state(unknown)).body.canResetPassword);
 for(let i=0;i<5;i++)await call('/api/auth/password-reset/request',{email:marker+'missing@example.invalid'},unknown);
 check('Reset rate limit enforced',(await call('/api/auth/password-reset/request',{email:marker+'missing@example.invalid'},unknown)).status===429);
 console.log(JSON.stringify({passed:true,checks:rows.length}));
 if(process.env.RESET_EVIDENCE_FILE)fs.writeFileSync(process.env.RESET_EVIDENCE_FILE,JSON.stringify({base,rows,passed:true},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{
 const ids=users.map(u=>u.id);
 await prisma.appNotification.deleteMany({where:{OR:[{recipientUserId:{in:ids}},{message:{contains:marker}}]}});
 await prisma.auditLog.deleteMany({where:{OR:[{performedById:{in:ids}},{entityId:{in:requestIds}}]}});
 await prisma.emailOutbox.deleteMany({where:{OR:[{recipientEmail:{contains:marker.toLowerCase()}},{entityId:{in:requestIds}}]}});
 await prisma.user.deleteMany({where:{id:{in:ids}}});
 await prisma.$disconnect();console.log('Synthetic reset accounts removed.');
});
