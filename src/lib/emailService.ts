import crypto from 'crypto';
import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';

export type EmailEventType =
  | 'EMPLOYEE_REGISTRATION_CONFIRMATION'
  | 'ADMIN_NEW_EMPLOYEE_REQUEST'
  | 'EMPLOYEE_APPROVED'
  | 'EMPLOYEE_REJECTED'
  | 'ADMIN_PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_APPROVED'
  | 'PASSWORD_RESET_REJECTED'
  | 'PASSWORD_RESET_COMPLETED';

export type EmailDeliveryStatus =
  | 'ACCEPTED_BY_SMTP'
  | 'SKIPPED_DISABLED'
  | 'FAILED'
  | 'ALREADY_SENT';

export interface EmailDispatchResult {
  status: EmailDeliveryStatus;
  recipientEmail: string;
  eventType: EmailEventType;
  messageId?: string | null;
  warning?: string | null;
}

interface OutboxRow {
  id: string;
  status: string;
  smtpMessageId: string | null;
  attempts: number;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAppBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim() || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

function getSmtpConfig() {
  const emailEnabledRaw = (process.env.EMAIL_ENABLED || '').trim().toLowerCase();
  const enabled = emailEnabledRaw === 'true' || emailEnabledRaw === '1' || emailEnabledRaw === 'yes';
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt((process.env.SMTP_PORT || '587').trim(), 10) || 587;
  const secureRaw = (process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureRaw === 'true' || secureRaw === '1' || port === 465;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';
  const fromEmail = (process.env.SMTP_FROM_EMAIL || user || 'no-reply@gateshield.local').trim();
  const fromName = (process.env.SMTP_FROM_NAME || 'GateShield Security System').trim();

  const isPlaceholderHost = !host || host === 'smtp.example.com';
  const isConfigured = enabled && !isPlaceholderHost && Boolean(fromEmail);

  return {
    enabled,
    isConfigured,
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
  };
}

async function dispatchEmailWithOutbox(params: {
  eventType: EmailEventType;
  recipientEmail: string;
  subject: string;
  entityId: string;
  dedupeKey: string;
  html: string;
  text: string;
}): Promise<EmailDispatchResult> {
  const recipientEmail = params.recipientEmail.trim().toLowerCase();
  if (!recipientEmail) {
    return {
      status: 'FAILED',
      recipientEmail: '',
      eventType: params.eventType,
      warning: 'Recipient email address is empty.',
    };
  }

  try {
    // 1. Check outbox for existing dedupeKey to prevent duplicate sends on retry/concurrency
    const existingRows = await prisma.$queryRaw<OutboxRow[]>`
      SELECT "id", "status", "smtpMessageId", "attempts"
      FROM "email_outbox"
      WHERE "dedupeKey" = ${params.dedupeKey}
      LIMIT 1
    `;

    let outboxId = existingRows[0]?.id;

    if (existingRows.length > 0 && existingRows[0].status === 'ACCEPTED_BY_SMTP') {
      return {
        status: 'ALREADY_SENT',
        recipientEmail,
        eventType: params.eventType,
        messageId: existingRows[0].smtpMessageId,
      };
    }

    if (!outboxId) {
      outboxId = `em_${crypto.randomBytes(12).toString('hex')}`;
      await prisma.$executeRaw`
        INSERT INTO "email_outbox" (
          "id",
          "eventType",
          "recipientEmail",
          "subject",
          "entityId",
          "dedupeKey",
          "status",
          "attempts",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${outboxId},
          ${params.eventType},
          ${recipientEmail},
          ${params.subject},
          ${params.entityId},
          ${params.dedupeKey},
          'PENDING',
          0,
          NOW(),
          NOW()
        )
        ON CONFLICT ("dedupeKey") DO NOTHING
      `;

      const recheck = await prisma.$queryRaw<OutboxRow[]>`
        SELECT "id", "status", "smtpMessageId", "attempts"
        FROM "email_outbox"
        WHERE "dedupeKey" = ${params.dedupeKey}
        LIMIT 1
      `;
      if (recheck.length > 0) {
        outboxId = recheck[0].id;
        if (recheck[0].status === 'ACCEPTED_BY_SMTP') {
          return {
            status: 'ALREADY_SENT',
            recipientEmail,
            eventType: params.eventType,
            messageId: recheck[0].smtpMessageId,
          };
        }
      }
    }

    const smtp = getSmtpConfig();

    if (!smtp.isConfigured) {
      const reason = !smtp.enabled
        ? 'EMAIL_ENABLED is not set to true'
        : 'SMTP_HOST / credentials are not configured';
      console.warn(
        `[GateShield Email Warning] Skipping SMTP dispatch for ${params.eventType} to ${recipientEmail}: ${reason}.`
      );
      await prisma.$executeRaw`
        UPDATE "email_outbox"
        SET "status" = 'SKIPPED_DISABLED',
            "errorMessage" = ${reason},
            "attempts" = "attempts" + 1,
            "updatedAt" = NOW()
        WHERE "id" = ${outboxId}
      `;
      return {
        status: 'SKIPPED_DISABLED',
        recipientEmail,
        eventType: params.eventType,
        warning: `Email dispatch skipped (${reason}). Database state was saved normally.`,
      };
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user
        ? {
            user: smtp.user,
            pass: smtp.pass,
          }
        : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });

    const info = await transporter.sendMail({
      from: `"${smtp.fromName.replace(/"/g, '')}" <${smtp.fromEmail}>`,
      to: recipientEmail,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    const messageId = info?.messageId || null;

    await prisma.$executeRaw`
      UPDATE "email_outbox"
      SET "status" = 'ACCEPTED_BY_SMTP',
          "smtpMessageId" = ${messageId},
          "errorMessage" = NULL,
          "attempts" = "attempts" + 1,
          "sentAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${outboxId}
    `;

    return {
      status: 'ACCEPTED_BY_SMTP',
      recipientEmail,
      eventType: params.eventType,
      messageId,
    };
  } catch (err: unknown) {
    const safeMsg = err instanceof Error ? err.message.slice(0, 300) : 'SMTP transport error';
    console.error(
      `[GateShield Email Error] Failed to send ${params.eventType} to ${recipientEmail}:`,
      safeMsg
    );
    try {
      await prisma.$executeRaw`
        UPDATE "email_outbox"
        SET "status" = 'FAILED',
            "errorMessage" = ${safeMsg},
            "attempts" = "attempts" + 1,
            "updatedAt" = NOW()
        WHERE "dedupeKey" = ${params.dedupeKey}
      `;
    } catch {
      // Ignore secondary outbox update errors so caller never crashes
    }

    return {
      status: 'FAILED',
      recipientEmail,
      eventType: params.eventType,
      warning: 'Email could not be delivered by the SMTP server, but the database update succeeded.',
    };
  }
}

function buildEmailWrapper(title: string, badgeText: string, badgeColor: string, bodyHtml: string): string {
  const appUrl = getAppBaseUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#354F96,#2b417d);padding:24px 28px;color:#ffffff;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:0.85;">GateShield Visitor &amp; Access Control</div>
              <div style="font-size:20px;font-weight:800;margin-top:6px;">${escapeHtml(title)}</div>
              <div style="margin-top:10px;">
                <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background-color:${badgeColor};color:#ffffff;">
                  ${escapeHtml(badgeText)}
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:14px;line-height:1.6;color:#334155;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
              Automated notification from GateShield Security System &bull; <a href="${escapeHtml(appUrl)}" style="color:#354F96;text-decoration:none;">${escapeHtml(appUrl)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 1. Employee registration confirmation email (sent to applicant)
 */
export async function sendEmployeeRegistrationConfirmationEmail(employee: {
  id: string;
  name: string;
  email: string;
  departmentName: string;
  position: string;
  phoneNumber: string;
  createdAt: Date | string;
}): Promise<EmailDispatchResult> {
  const portalUrl = `${getAppBaseUrl()}/employee`;
  const subject = 'GateShield Employee Portal • Registration Request Received';

  const bodyHtml = `
    <p style="margin-top:0;">Hello <strong>${escapeHtml(employee.name)}</strong>,</p>
    <p>Your registration request for the <strong>GateShield Employee Portal</strong> has been received and is currently <strong>PENDING</strong> administrator approval.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
      <tr><td style="padding:4px 0;color:#64748b;width:140px;">Full Name:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(employee.name)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Department:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(employee.departmentName)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Position:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(employee.position)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Phone Number:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(employee.phoneNumber)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Status:</td><td style="padding:4px 0;font-weight:700;color:#d97706;">PENDING APPROVAL</td></tr>
    </table>
    <p>You will receive another email as soon as an administrator reviews your request. You can also check your live approval status at any time on the Employee Portal:</p>
    <p style="margin:22px 0;">
      <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background-color:#354F96;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">Check Status on Employee Portal</a>
    </p>
  `;

  const text = [
    `Hello ${employee.name},`,
    '',
    'Your registration request for the GateShield Employee Portal has been received and is currently PENDING administrator approval.',
    '',
    `Full Name: ${employee.name}`,
    `Department: ${employee.departmentName}`,
    `Position: ${employee.position}`,
    `Phone Number: ${employee.phoneNumber}`,
    'Status: PENDING APPROVAL',
    '',
    `Check your status at: ${portalUrl}`,
  ].join('\n');

  return dispatchEmailWithOutbox({
    eventType: 'EMPLOYEE_REGISTRATION_CONFIRMATION',
    recipientEmail: employee.email,
    subject,
    entityId: employee.id,
    dedupeKey: `emp_reg_confirm_${employee.id}`,
    html: buildEmailWrapper('Registration Request Received', 'PENDING APPROVAL', '#d97706', bodyHtml),
    text,
  });
}

/**
 * 2. Admin notification email when a new employee registration request is created
 */
export async function sendAdminNewEmployeeRequestEmail(employee: {
  id: string;
  name: string;
  email: string;
  departmentName: string;
  position: string;
  phoneNumber: string;
  createdAt: Date | string;
}): Promise<EmailDispatchResult> {
  let adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL || '').trim().toLowerCase();
  if (!adminEmail || adminEmail === 'admin@example.com') {
    try {
      const admins = await prisma.$queryRaw<Array<{ email: string }>>`
        SELECT "email"
        FROM "users"
        WHERE "role"::text = 'ADMIN' AND "active" = true
        ORDER BY "createdAt" ASC
        LIMIT 1
      `;
      if (admins.length > 0 && admins[0].email) {
        adminEmail = admins[0].email.trim().toLowerCase();
      }
    } catch {
      // Fallback handled below
    }
  }

  if (!adminEmail) {
    adminEmail = 'admin@gateshield.local';
  }

  const adminEmployeesUrl = `${getAppBaseUrl()}/employees?tab=requests&requestType=REGISTRATION&requestId=${encodeURIComponent(employee.id)}`;
  const formattedTime = new Date(employee.createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const subject = `New Employee Registration Request • ${employee.name} (${employee.departmentName})`;

  const bodyHtml = `
    <p style="margin-top:0;">A new employee has submitted a registration request and is awaiting administrator review.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
      <tr><td style="padding:4px 0;color:#64748b;width:140px;">Employee Name:</td><td style="padding:4px 0;font-weight:700;color:#0f172a;">${escapeHtml(employee.name)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Department:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(employee.departmentName)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Position:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(employee.position)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Phone Number:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(employee.phoneNumber)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Email Address:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(employee.email)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Requested At:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(formattedTime)}</td></tr>
    </table>
    <p style="margin:22px 0;">
      <a href="${escapeHtml(adminEmployeesUrl)}" style="display:inline-block;background-color:#354F96;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">Review in Admin Panel</a>
    </p>
  `;

  const text = [
    'A new employee registration request has been submitted:',
    '',
    `Employee Name: ${employee.name}`,
    `Department: ${employee.departmentName}`,
    `Position: ${employee.position}`,
    `Phone Number: ${employee.phoneNumber}`,
    `Email Address: ${employee.email}`,
    `Requested At: ${formattedTime}`,
    '',
    `Review in Admin Panel: ${adminEmployeesUrl}`,
  ].join('\n');

  return dispatchEmailWithOutbox({
    eventType: 'ADMIN_NEW_EMPLOYEE_REQUEST',
    recipientEmail: adminEmail,
    subject,
    entityId: employee.id,
    dedupeKey: `admin_emp_req_${employee.id}`,
    html: buildEmailWrapper('New Employee Registration Request', 'ACTION REQUIRED', '#354F96', bodyHtml),
    text,
  });
}

/**
 * 3. Employee approval email (sent when Admin approves the registration request)
 */
export async function sendEmployeeApprovedEmail(employee: {
  id: string;
  name: string;
  email: string;
  departmentName: string;
  position: string;
  approvedAt: Date | string;
}): Promise<EmailDispatchResult> {
  const portalUrl = `${getAppBaseUrl()}/employee`;
  const subject = 'GateShield Employee Portal • Your Account Has Been Approved';

  const bodyHtml = `
    <p style="margin-top:0;">Hello <strong>${escapeHtml(employee.name)}</strong>,</p>
    <p>Great news! Your <strong>GateShield Employee Portal</strong> account has been <strong>APPROVED</strong> by the administrator.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;">
      <tr><td style="padding:4px 0;color:#166534;width:140px;">Account Status:</td><td style="padding:4px 0;font-weight:800;color:#15803d;">APPROVED</td></tr>
      <tr><td style="padding:4px 0;color:#166534;">Department:</td><td style="padding:4px 0;font-weight:600;color:#14532d;">${escapeHtml(employee.departmentName)}</td></tr>
      <tr><td style="padding:4px 0;color:#166534;">Position:</td><td style="padding:4px 0;font-weight:600;color:#14532d;">${escapeHtml(employee.position)}</td></tr>
      <tr><td style="padding:4px 0;color:#166534;">Login Email:</td><td style="padding:4px 0;font-weight:600;color:#14532d;">${escapeHtml(employee.email)}</td></tr>
    </table>
    <p>You can now sign in to the Employee Portal to invite guests and view your visited guest history:</p>
    <p style="margin:22px 0;">
      <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background-color:#16a34a;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">Sign In to Employee Portal</a>
    </p>
  `;

  const text = [
    `Hello ${employee.name},`,
    '',
    'Your GateShield Employee Portal account has been APPROVED by the administrator.',
    '',
    'Account Status: APPROVED',
    `Department: ${employee.departmentName}`,
    `Position: ${employee.position}`,
    `Login Email: ${employee.email}`,
    '',
    `Sign in to the Employee Portal: ${portalUrl}`,
  ].join('\n');

  return dispatchEmailWithOutbox({
    eventType: 'EMPLOYEE_APPROVED',
    recipientEmail: employee.email,
    subject,
    entityId: employee.id,
    dedupeKey: `emp_approved_${employee.id}`,
    html: buildEmailWrapper('Employee Account Approved', 'APPROVED', '#16a34a', bodyHtml),
    text,
  });
}

/**
 * 4. Employee rejection/dismissal email (sent when Admin rejects or dismisses the request)
 */
export async function sendEmployeeRejectedEmail(employee: {
  id: string;
  name: string;
  email: string;
  departmentName: string;
  position: string;
  rejectionReason?: string | null;
}): Promise<EmailDispatchResult> {
  const subject = 'GateShield Employee Portal • Registration Request Update';
  const reasonLine = employee.rejectionReason?.trim()
    ? `<tr><td style="padding:4px 0;color:#991b1b;">Admin Note:</td><td style="padding:4px 0;font-weight:600;color:#7f1d1d;">${escapeHtml(employee.rejectionReason.trim())}</td></tr>`
    : '';

  const bodyHtml = `
    <p style="margin-top:0;">Hello <strong>${escapeHtml(employee.name)}</strong>,</p>
    <p>Your registration request for the <strong>GateShield Employee Portal</strong> was reviewed by an administrator and was <strong>not approved</strong> at this time.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;">
      <tr><td style="padding:4px 0;color:#991b1b;width:140px;">Request Status:</td><td style="padding:4px 0;font-weight:800;color:#dc2626;">NOT APPROVED</td></tr>
      <tr><td style="padding:4px 0;color:#991b1b;">Department:</td><td style="padding:4px 0;font-weight:600;color:#7f1d1d;">${escapeHtml(employee.departmentName)}</td></tr>
      <tr><td style="padding:4px 0;color:#991b1b;">Position:</td><td style="padding:4px 0;font-weight:600;color:#7f1d1d;">${escapeHtml(employee.position)}</td></tr>
      ${reasonLine}
    </table>
    <p>If you believe this was in error or need further assistance, please contact your department administrator or security office.</p>
  `;

  const text = [
    `Hello ${employee.name},`,
    '',
    'Your registration request for the GateShield Employee Portal was reviewed by an administrator and was not approved at this time.',
    '',
    'Request Status: NOT APPROVED',
    `Department: ${employee.departmentName}`,
    `Position: ${employee.position}`,
    ...(employee.rejectionReason?.trim() ? [`Admin Note: ${employee.rejectionReason.trim()}`] : []),
    '',
    'If you believe this was in error, please contact your department administrator.',
  ].join('\n');

  return dispatchEmailWithOutbox({
    eventType: 'EMPLOYEE_REJECTED',
    recipientEmail: employee.email,
    subject,
    entityId: employee.id,
    dedupeKey: `emp_rejected_${employee.id}`,
    html: buildEmailWrapper('Registration Request Update', 'NOT APPROVED', '#dc2626', bodyHtml),
    text,
  });
}

/**
 * 5. Admin notification email when a user submits a Password Reset Request
 */
export async function sendAdminPasswordResetRequestEmail(params: {
  requestId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  createdAt: Date | string;
}): Promise<EmailDispatchResult> {
  let adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL || '').trim().toLowerCase();
  if (!adminEmail || adminEmail === 'admin@example.com') {
    try {
      const admins = await prisma.$queryRaw<Array<{ email: string }>>`
        SELECT "email"
        FROM "users"
        WHERE "role"::text = 'ADMIN' AND "active" = true
        ORDER BY "createdAt" ASC
        LIMIT 1
      `;
      if (admins.length > 0 && admins[0].email) {
        adminEmail = admins[0].email.trim().toLowerCase();
      }
    } catch {
      // Fallback handled below
    }
  }
  if (!adminEmail) {
    adminEmail = 'admin@gateshield.local';
  }

  const targetPath =
    params.userRole === 'EMPLOYEE'
      ? `/employees?tab=requests&requestType=PASSWORD_RESET&requestId=${encodeURIComponent(params.requestId)}`
      : params.userRole === 'OPERATOR'
      ? `/access?tab=requests&requestType=PASSWORD_RESET&requestId=${encodeURIComponent(params.requestId)}`
      : `/settings?section=admin-security&requestId=${encodeURIComponent(params.requestId)}`;
  const dashboardUrl = `${getAppBaseUrl()}${targetPath}`;
  const formattedTime = new Date(params.createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const subject = `GateShield • New Password Reset Request (${params.userName} - ${params.userRole})`;

  const bodyHtml = `
    <p style="margin-top:0;">A user has requested an administrator-approved password reset.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
      <tr><td style="padding:4px 0;color:#64748b;width:140px;">User Name:</td><td style="padding:4px 0;font-weight:700;color:#0f172a;">${escapeHtml(params.userName)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Registered Email:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(params.userEmail)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Role:</td><td style="padding:4px 0;font-weight:700;color:#354F96;">${escapeHtml(params.userRole)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Requested At:</td><td style="padding:4px 0;font-weight:600;color:#0f172a;">${escapeHtml(formattedTime)}</td></tr>
    </table>
    <p style="margin:22px 0;">
      <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background-color:#354F96;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">Review Password Reset Request</a>
    </p>
  `;

  const text = [
    'A user has requested an administrator-approved password reset:',
    '',
    `User Name: ${params.userName}`,
    `Registered Email: ${params.userEmail}`,
    `Role: ${params.userRole}`,
    `Requested At: ${formattedTime}`,
    '',
    `Review on Admin Dashboard: ${dashboardUrl}`,
  ].join('\n');

  return dispatchEmailWithOutbox({
    eventType: 'ADMIN_PASSWORD_RESET_REQUEST',
    recipientEmail: adminEmail,
    subject,
    entityId: params.requestId,
    dedupeKey: `admin_pwd_reset_req_${params.requestId}`,
    html: buildEmailWrapper('Password Reset Request', 'ACTION REQUIRED', '#354F96', bodyHtml),
    text,
  });
}

/**
 * 6. User notification email when Admin APPROVES a Password Reset Request
 */
export async function sendPasswordResetApprovedEmail(params: {
  requestId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  expiryMinutes: number;
  authorizeTicket: string;
}): Promise<EmailDispatchResult> {
  const authorizeUrl = `${getAppBaseUrl()}/api/auth/password-reset/authorize?ticket=${encodeURIComponent(
    params.authorizeTicket
  )}`;
  const subject = 'GateShield • Your Password Reset Request Has Been Approved';

  const bodyHtml = `
    <p style="margin-top:0;">Hello <strong>${escapeHtml(params.userName)}</strong>,</p>
    <p>Your <strong>GateShield</strong> password reset request has been <strong>APPROVED</strong> by an Administrator.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;">
      <tr><td style="padding:4px 0;color:#166534;width:140px;">Status:</td><td style="padding:4px 0;font-weight:800;color:#15803d;">APPROVED</td></tr>
      <tr><td style="padding:4px 0;color:#166534;">Account Email:</td><td style="padding:4px 0;font-weight:600;color:#14532d;">${escapeHtml(params.userEmail)}</td></tr>
      <tr><td style="padding:4px 0;color:#166534;">Role:</td><td style="padding:4px 0;font-weight:600;color:#14532d;">${escapeHtml(params.userRole)}</td></tr>
      <tr><td style="padding:4px 0;color:#166534;">Authorization Validity:</td><td style="padding:4px 0;font-weight:700;color:#15803d;">Single-use (${params.expiryMinutes} minutes)</td></tr>
    </table>
    <p>Click the button below to securely create your new password. If you already have the GateShield recovery screen open in your browser, it has automatically updated in real time.</p>
    <p style="margin:22px 0;">
      <a href="${escapeHtml(authorizeUrl)}" style="display:inline-block;background-color:#354F96;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">Create New Password</a>
    </p>
    <p style="font-size:12px;color:#64748b;">For security reasons, this single-use authorization expires in ${params.expiryMinutes} minutes.</p>
  `;

  const text = [
    `Hello ${params.userName},`,
    '',
    'Your GateShield password reset request has been APPROVED by an Administrator.',
    `This single-use authorization is valid for ${params.expiryMinutes} minutes.`,
    '',
    `Create your new password here: ${authorizeUrl}`,
  ].join('\n');

  return dispatchEmailWithOutbox({
    eventType: 'PASSWORD_RESET_APPROVED',
    recipientEmail: params.userEmail,
    subject,
    entityId: params.requestId,
    dedupeKey: `pwd_reset_approved_${params.requestId}`,
    html: buildEmailWrapper('Password Reset Approved', 'APPROVED', '#16a34a', bodyHtml),
    text,
  });
}

/**
 * 7. User notification email when Admin REJECTS a Password Reset Request
 */
export async function sendPasswordResetRejectedEmail(params: {
  requestId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  rejectionReason?: string | null;
}): Promise<EmailDispatchResult> {
  const subject = 'GateShield • Password Reset Request Update';
  const reasonLine = params.rejectionReason?.trim()
    ? `<tr><td style="padding:4px 0;color:#991b1b;">Admin Note:</td><td style="padding:4px 0;font-weight:600;color:#7f1d1d;">${escapeHtml(params.rejectionReason.trim())}</td></tr>`
    : '';

  const bodyHtml = `
    <p style="margin-top:0;">Hello <strong>${escapeHtml(params.userName)}</strong>,</p>
    <p>Your password reset request for <strong>GateShield</strong> (${escapeHtml(params.userEmail)}) was reviewed by an Administrator and was <strong>not approved</strong>.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;">
      <tr><td style="padding:4px 0;color:#991b1b;width:140px;">Status:</td><td style="padding:4px 0;font-weight:800;color:#dc2626;">REJECTED</td></tr>
      <tr><td style="padding:4px 0;color:#991b1b;">Account Email:</td><td style="padding:4px 0;font-weight:600;color:#7f1d1d;">${escapeHtml(params.userEmail)}</td></tr>
      ${reasonLine}
    </table>
    <p>Your existing password has not been changed. Please contact your facility Administrator if you need assistance accessing your account.</p>
  `;

  const text = [
    `Hello ${params.userName},`,
    '',
    `Your password reset request for GateShield (${params.userEmail}) was reviewed by an Administrator and was not approved.`,
    ...(params.rejectionReason?.trim() ? [`Admin Note: ${params.rejectionReason.trim()}`] : []),
    '',
    'Your existing password remains unchanged.',
  ].join('\n');

  return dispatchEmailWithOutbox({
    eventType: 'PASSWORD_RESET_REJECTED',
    recipientEmail: params.userEmail,
    subject,
    entityId: params.requestId,
    dedupeKey: `pwd_reset_rejected_${params.requestId}`,
    html: buildEmailWrapper('Password Reset Request Declined', 'REJECTED', '#dc2626', bodyHtml),
    text,
  });
}

/**
 * 8. User notification email when Password Reset is COMPLETED
 */
export async function sendPasswordResetCompletedEmail(params: {
  requestId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  completedAt: Date | string;
}): Promise<EmailDispatchResult> {
  const loginPath =
    params.userRole === 'EMPLOYEE'
      ? '/employee'
      : params.userRole === 'ADMIN'
      ? '/admin'
      : '/login';
  const loginUrl = `${getAppBaseUrl()}${loginPath}`;
  const formattedTime = new Date(params.completedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const subject = 'GateShield • Your Password Has Been Updated';

  const bodyHtml = `
    <p style="margin-top:0;">Hello <strong>${escapeHtml(params.userName)}</strong>,</p>
    <p>Your <strong>GateShield</strong> account password was successfully updated on <strong>${escapeHtml(formattedTime)}</strong>.</p>
    <p>Any previous active sessions have been invalidated for your security. You can now sign in with your new password:</p>
    <p style="margin:22px 0;">
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background-color:#354F96;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">Sign In to GateShield</a>
    </p>
    <p style="font-size:12px;color:#64748b;">If you did not perform this change, please contact your security administrator immediately.</p>
  `;

  const text = [
    `Hello ${params.userName},`,
    '',
    `Your GateShield account password was successfully updated on ${formattedTime}.`,
    `Sign in here: ${loginUrl}`,
  ].join('\n');

  return dispatchEmailWithOutbox({
    eventType: 'PASSWORD_RESET_COMPLETED',
    recipientEmail: params.userEmail,
    subject,
    entityId: params.requestId,
    dedupeKey: `pwd_reset_completed_${params.requestId}`,
    html: buildEmailWrapper('Password Updated Successfully', 'COMPLETED', '#354F96', bodyHtml),
    text,
  });
}
