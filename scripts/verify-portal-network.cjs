const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');

// Run against a loopback web listener started with PORTAL_TRUST_PROXY=true.
const base = 'http://127.0.0.1:3019';
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.pathname, '/gatekeeper_local');
assert.equal(process.env.EMAIL_ENABLED, 'false');

const db = new PrismaClient();
const policyKey = 'portal_network_access';
const allowedIp = '203.0.113.17';
const blockedIp = '198.51.100.24';
const password = randomBytes(24).toString('hex');
const qrToken = 'GKOP_' + randomBytes(32).toString('hex');
const marker = 'NetworkTest' + randomBytes(8).toString('hex');
const users = [];
let checks = 0;
let ownsPolicy = false;

async function request(path, { method, body, ip, cookie, forwarded, status }) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(ip ? { 'X-Real-IP': ip } : {}),
      ...(forwarded ? { 'X-Forwarded-For': forwarded } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, status, path);
  checks++;
  return response;
}

async function login(user, ip, status, forwarded) {
  const path = user.role === 'EMPLOYEE' ? '/api/employee/login' : '/api/auth/login';
  const response = await request(path, {
    method: 'POST', body: { email: user.email, password }, ip, forwarded, status,
  });
  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
}

async function main() {
  assert.equal(await db.systemSetting.findUnique({ where: { key: policyKey } }), null,
    'Use a local database without a saved portal network policy.');
  const passwordHash = await hash(password, 10);
  for (const role of ['ADMIN', 'OPERATOR', 'EMPLOYEE']) {
    users.push(await db.user.create({
      data: {
        name: marker, email: `${marker.toLowerCase()}-${role.toLowerCase()}@example.invalid`, role, passwordHash,
        ...(role === 'OPERATOR' ? { qrLoginHash: createHash('sha256').update(qrToken).digest('hex') } : {}),
      },
    }));
  }
  const [admin, operator, employee] = users;
  const oldOperatorSession = await login(operator, blockedIp, 200);
  const oldEmployeeSession = await login(employee, blockedIp, 200);
  const adminSession = await login(admin, blockedIp, 200);
  const endpoint = '/api/settings/portal-network';
  const save = (cookie, body, status, ip = blockedIp) =>
    request(endpoint, { method: 'PUT', body, ip, cookie, status });
  const policy = { enabled: true, addresses: [allowedIp, '2001:0db8:0:0:0:0:0:17', '::ffff:' + allowedIp] };

  await request(endpoint, { status: 403 });
  await request(endpoint, { cookie: oldEmployeeSession, ip: blockedIp, status: 403 });
  await save(oldOperatorSession, policy, 403);
  await save(adminSession, { enabled: true, addresses: [] }, 400);
  await save(adminSession, { enabled: true, addresses: ['203.0.113.0/24'] }, 400);
  const saved = await save(adminSession, policy, 200);
  ownsPolicy = true;
  assert.deepEqual((await saved.json()).policy.addresses, [allowedIp, '2001:db8::17']);
  const settings = await request(endpoint, { cookie: adminSession, ip: blockedIp, status: 200 });
  assert.equal((await settings.json()).clientIp, blockedIp);

  await login(operator, blockedIp, 403, allowedIp);
  await login(employee, blockedIp, 403, allowedIp);
  await login(admin, blockedIp, 200);
  await login(operator, allowedIp, 200);
  await login(employee, '2001:db8::17', 200);
  await request('/api/auth/qr-login', { method: 'POST', body: { token: qrToken }, ip: blockedIp, status: 403 });
  await request('/api/auth/qr-login', { method: 'POST', body: { token: qrToken }, ip: allowedIp, status: 200 });
  await request('/api/operator/register', { method: 'POST', body: {}, ip: blockedIp, status: 403 });
  await request('/api/employee/register', { method: 'POST', body: {}, ip: blockedIp, status: 403 });
  await request('/api/operator/status', { ip: blockedIp, status: 403 });
  await request('/api/employee/status', { ip: blockedIp, cookie: oldEmployeeSession, status: 403 });
  await request('/api/auth/me', { ip: blockedIp, cookie: oldOperatorSession, forwarded: allowedIp, status: 401 });
  await request('/api/auth/me', { cookie: oldOperatorSession, forwarded: allowedIp, status: 401 });
  await request('/api/auth/me', { ip: allowedIp + ', ' + blockedIp, cookie: oldOperatorSession, status: 401 });
  await request('/api/auth/me', { ip: '::ffff:' + allowedIp, cookie: oldOperatorSession, status: 200 });
  await request('/api/employee/invitations', { ip: blockedIp, cookie: oldEmployeeSession, status: 401 });
  await request('/api/employee/invitations', { ip: allowedIp, cookie: oldEmployeeSession, status: 200 });

  await save(adminSession, { enabled: true, addresses: ['2001:db8::17'] }, 200);
  await request('/api/auth/me', { ip: allowedIp, cookie: oldOperatorSession, status: 401 });
  await request('/api/employee/invitations', { ip: allowedIp, cookie: oldEmployeeSession, status: 401 });
  await save(adminSession, { enabled: false, addresses: [] }, 200);
  await request('/api/auth/me', { ip: blockedIp, cookie: oldOperatorSession, status: 200 });
  await request('/api/employee/invitations', { ip: blockedIp, cookie: oldEmployeeSession, status: 200 });
  console.log(`${checks} portal network checks passed.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  const ids = users.map(user => user.id);
  try {
    if (ownsPolicy) await db.systemSetting.delete({ where: { key: policyKey } });
    await db.auditLog.deleteMany({ where: { performedById: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await db.$disconnect();
  }
}).catch(error => { console.error('Fixture cleanup failed:', error.message); process.exitCode = 1; });
