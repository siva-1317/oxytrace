import nodemailer from 'nodemailer';

function getTransportConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return {
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  };
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const config = getTransportConfig();
  if (!config) return null;
  transporter = nodemailer.createTransport(config);
  return transporter;
}

export function isMailConfigured() {
  return Boolean(getTransportConfig());
}

export async function sendMail({ to, subject, html, text, replyTo }) {
  const tx = getTransporter();
  if (!tx) {
    throw new Error('Mail service is not configured');
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const info = await tx.sendMail({
    from,
    to,
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {})
  });

  return info;
}
