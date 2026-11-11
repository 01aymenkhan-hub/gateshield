// Explicit local bootstrap.
//   npm run db:seed       -> creates the admin from .env if missing (never overwrites)
//   npm run db:dev-admin  -> also resets that admin's password to ADMIN_PASSWORD (dev only)
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');
const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === 'production';
const resetPassword = process.argv.includes('--reset-password');

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  // Simple passwords are allowed only for local development databases.
  const minLength = isProduction ? 16 : 6;
  if (!email || !password || password.length < minLength || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error(`Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least ${minLength} characters and at most 72 UTF-8 bytes in .env.`);
  }
  if (resetPassword && isProduction) {
    throw new Error('--reset-password is disabled when NODE_ENV=production.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'ADMIN') throw new Error('Configured account already exists without ADMIN role; no changes made.');
    if (!resetPassword) {
      console.log('Local admin already exists; account and password unchanged.');
      return;
    }
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: await hash(password, 12),
        active: true,
        approvalStatus: 'APPROVED',
        passwordChangedAt: new Date(),
      },
    });
    console.log(`Local admin password reset for ${email}.`);
    return;
  }
  await prisma.user.create({ data: {
    email, passwordHash: await hash(password, 12), name: 'Local Administrator', role: 'ADMIN', active: true,
  } });
  console.log(`Local admin created: ${email}.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
