import 'server-only';

const DEFAULT_ADMIN_EMAILS = ['tim@jov.ie', 't@timwhite.co'];

function parseAdminEmails(): Set<string> {
  const raw =
    process.env.ADMIN_EMAIL_ALLOWLIST ??
    process.env.ADMIN_EMAILS ??
    DEFAULT_ADMIN_EMAILS.join(',');

  return new Set(
    raw
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

const adminEmails = parseAdminEmails();

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails.has(email.toLowerCase());
}
