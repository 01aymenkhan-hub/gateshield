/* Real workflow checks. Uses only temporary synthetic records and removes them. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');
const prisma = new PrismaClient();
const base = process.argv[2] || 'http://127.0.0.1:3004';
const database = new URL(process.env.DATABASE_URL).pathname;
assert.ok(database.includes('candidate') || process.argv.includes('--production'), 'Use an isolated candidate database unless explicitly testing production.');
const marker = `UpgradeTest${crypto.randomBytes(5).toString('hex')}`;
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const rows = [], users = [], people = [], parcels = [], storedFiles = new Set();
const record = (check) => { rows.push({ check, passed: true }); console.log(check); };
let cookie = '';
async function call(route, body, expected = 200, method = body ? 'POST' : 'GET', auth = cookie) {
  const res = await fetch(base + route, { method, headers: { ...(auth ? { Cookie: auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  assert.equal(res.status, expected, `${route}: ${JSON.stringify(data)}`);
  return data;
}
function keepFile(value) {
  if (value) storedFiles.add(value.replace(/^\/api\/files\//, ''));
}
async function keepPersonFiles(id) {
  const person = await prisma.person.findUnique({ where: { id } });
  for (const field of ['photoUrl', 'cnicImagePath', 'dlsImagePath', 'deliveryDocImagePath']) keepFile(person[field]);
  for (const visit of await prisma.visit.findMany({ where: { personId: id } })) {
    keepFile(visit.incomingDocPath); keepFile(visit.outgoingDocPath);
  }
}
(async () => {
  const password = crypto.randomBytes(24).toString('base64url');
  const user = await prisma.user.create({ data: { email: `${marker}@example.invalid`, name: marker, passwordHash: await hash(password, 12), role: 'ADMIN', active: true } });
  users.push(user.id);
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  assert.ok(cookie); record('Temporary admin login');
  const gate = await prisma.gate.findFirst({ where: { active: true } });
  const department = await prisma.department.findFirst({ where: { active: true } });
  assert.ok(gate && department, 'Existing active gate and department required');
  for (const route of ['/api/dashboard/stats', '/api/parcels', '/api/vip-guests', '/api/visitors']) {
    await call(route); record(`Existing staff route ${route}`);
  }
  const delivery = { fullName: marker, category: 'DELIVERY', deliverySource: marker + ' Logistics', vehicleNo: 'TEST-' + marker.slice(-6), phoneNumber: '03990000001', entryGateId: gate.id };
  await call('/api/visits/check-in', delivery, 400); record('Delivery rejects missing incoming document');
  const incoming = await call('/api/visits/check-in', { ...delivery, deliveryDocImageData: image });
  const personId = incoming.visit.personId; people.push(personId); await keepPersonFiles(personId);
  assert.equal(incoming.visit.person.category, 'DELIVERY');
  assert.equal(incoming.visit.hasIncomingDoc, true);
  assert.equal(incoming.visit.person.cnicImageData, undefined);
  record('Delivery check-in persists incoming document and hides storage payloads');
  const vehicleKey = delivery.vehicleNo.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const found = await call('/api/visits/status?q=' + vehicleKey + '&mode=checkout');
  assert.equal(found.found, true); assert.equal(found.person.id, personId); record('Normalized vehicle number lookup');
  const docUrl = `/api/visitors/${personId}/document-image?type=delivery_in&visitId=${incoming.visit.id}`;
  const doc = await fetch(base + docUrl, { headers: { Cookie: cookie } });
  assert.equal(doc.status, 200); assert.equal(doc.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await doc.arrayBuffer()), Buffer.from(image.split(',')[1], 'base64'));
  assert.equal((await fetch(base + docUrl)).status, 401); record('Incoming document exact bytes; anonymous access denied');
  const missing = await call('/api/visits/check-out', { visitId: incoming.visit.id, exitGateId: gate.id }, 400);
  assert.equal(missing.code, 'DELIVERY_OUTGOING_DOC_REQUIRED'); record('Delivery checkout requires outgoing document');
  const outgoing = await call('/api/visits/check-out', { identifier: vehicleKey, exitGateId: gate.id, outgoingDocImageData: image });
  await keepPersonFiles(personId); assert.equal(outgoing.visit.status, 'CHECKED_OUT'); assert.equal(outgoing.visit.hasOutgoingDoc, true); record('Vehicle checkout persists outgoing document');
  const outDoc = await fetch(base + `/api/visitors/${personId}/document-image?type=delivery_out&visitId=${incoming.visit.id}`, { headers: { Cookie: cookie } });
  assert.equal(outDoc.status, 200); assert.deepEqual(Buffer.from(await outDoc.arrayBuffer()), Buffer.from(image.split(',')[1], 'base64')); record('Outgoing document exact-byte retrieval');
  const standard = await call('/api/visits/check-in', { fullName: marker + ' Visitor', category: 'VISITOR', hostName: marker, departmentId: department.id, visitorCardNo: marker, entryGateId: gate.id, cnicImageData: image });
  people.push(standard.visit.personId); await keepPersonFiles(standard.visit.personId);
  assert.equal(standard.imageStorageStatus, 'saved');
  await call('/api/visits/check-out', { visitId: standard.visit.id, exitGateId: gate.id }); record('Standard visitor and scanned-image storage remain functional');
  await call('/api/parcels', {}, 400); record('Parcel sender validation');
  const parcel = await call('/api/parcels', { senderName: marker, senderPhone: '03990000002', ownerName: marker, ownerPhone: '03990000003', departmentId: department.id, senderPlatform: 'Synthetic workflow test', photoUrl: image }, 201);
  parcels.push(parcel.parcel.id); keepFile(parcel.parcel.photoUrl);
  assert.equal(parcel.parcel.senderName, marker); assert.equal(parcel.parcel.senderPhone, '03990000002'); assert.equal(parcel.parcel.status, 'RECEIVED'); record('Unexpected parcel stores sender details and persistent photo');
  const photo = await fetch(base + parcel.parcel.photoUrl, { headers: { Cookie: cookie } });
  assert.equal(photo.status, 200); assert.equal((await fetch(base + parcel.parcel.photoUrl)).status, 401); record('Stored parcel photo requires authentication');
  const delivered = await call('/api/parcels/' + parcel.parcel.id, { action: 'DELIVER', deliveryGateId: gate.id }, 200, 'PATCH');
  assert.equal(delivered.parcel.status, 'DELIVERED'); record('Parcel delivered transition');
  console.log(JSON.stringify({ base, checks: rows.length, passed: true }));
  if (process.env.UPGRADE_EVIDENCE_FILE) fs.writeFileSync(process.env.UPGRADE_EVIDENCE_FILE, JSON.stringify({ base, rows, passed: true }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  for (const id of people) { await keepPersonFiles(id); await prisma.appNotification.deleteMany({ where: { visitId: { in: (await prisma.visit.findMany({ where: { personId: id }, select: { id: true } })).map(v => v.id) } } }); await prisma.visit.deleteMany({ where: { personId: id } }); await prisma.person.delete({ where: { id } }); }
  for (const id of parcels) { await prisma.appNotification.deleteMany({ where: { parcelId: id } }); await prisma.parcel.delete({ where: { id } }); }
  for (const id of users) { await prisma.auditLog.deleteMany({ where: { performedById: id } }); await prisma.user.delete({ where: { id } }); }
  const uploadRoot = path.resolve(process.env.GATESHIELD_UPLOADS_DIR || 'uploads');
  for (const key of storedFiles) { const file = path.resolve(uploadRoot, key); if (!file.startsWith(uploadRoot + path.sep)) throw Error('Unexpected cleanup path'); fs.rmSync(file, { force: true }); }
  await prisma.$disconnect(); console.log('Synthetic records and their stored files removed.');
});
