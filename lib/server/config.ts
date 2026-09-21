import path from 'node:path';

export function config() {
  const production = process.env.NODE_ENV === 'production';
  const appUrl = (process.env.APP_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
  return {
    production, appUrl,
    dataDir: path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || './data'),
    contentDir: path.resolve(/* turbopackIgnore: true */ process.env.CONTENT_DIR || './content/reports'),
    adminEmail: process.env.ADMIN_EMAIL || 'ashu@alhena.ai',
    mailFrom: process.env.MAIL_FROM || 'Comparison Lab <reports@alhena.ai>',
    mailTransport: process.env.MAIL_TRANSPORT || (production ? 'sendgrid' : 'file'),
    sendgridKey: process.env.SENDGRID_API_KEY || '',
    resendKey: process.env.RESEND_API_KEY || '',
    workerSecret: process.env.WORKER_SECRET || '',
    secureCookies: appUrl.startsWith('https://'),
    leaseSeconds: 300,
    maxAttempts: 3,
  };
}

export function readiness() {
  const c = config();
  const emailReady = c.mailTransport === 'sendgrid' ? !!c.sendgridKey
    : c.mailTransport === 'resend' ? !!c.resendKey : c.mailTransport === 'file' && !c.production;
  return {
    emailConfigured: emailReady,
    emailDelivery: c.mailTransport === 'file' ? 'local-development-files' : 'email',
    workerConfigured: c.workerSecret.length >= 32,
    publicUrlConfigured: !c.production || c.appUrl.startsWith('https://'),
    automaticPublication: true,
  };
}
