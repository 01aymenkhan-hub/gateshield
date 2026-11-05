// Explicit local bootstrap. Existing accounts/passwords are never overwritten.
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 16) {
    throw new Error('Set ADMIN_EMAIL and a generated ADMIN_PASSWORD of at least 16 characters in .env.');
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'ADMIN') throw new Error('Configured account already exists without ADMIN role; no changes made.');
    console.log('Local admin already exists; account and password unchanged.');
    return;
  }
  await prisma.user.create({ data: {
    email, passwordHash: await hash(password, 12), name: 'Local Administrator', role: 'ADMIN', active: true,
  } });
  console.log('Local admin created. Credentials are in the private .env file.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
