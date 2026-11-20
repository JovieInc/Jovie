/**
 * Message hygiene. Mesh bodies must carry no secrets and none of Tim's personal
 * data. Rejection codes are fixed; the body is never echoed back.
 */

const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_-]{20,}\b/,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bdp\.(?:st|pt|sa|ct)\.[A-Za-z0-9_-]{20,}\b/,
  /\blin_(?:api|oauth)_[A-Za-z0-9]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/i,
  /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{12,}/i,
];

/** Phone numbers (E.164 or common US formats) and emails outside company domains. */
const PHONE = /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const COMPANY_EMAIL_DOMAINS = new Set([
  'jov.ie',
  'jovie.com',
  'canary.jov.ie',
  'example.com',
  'users.noreply.github.com',
  'anthropic.com',
]);

export type ScanVerdict =
  | { ok: true }
  | { ok: false; code: 'secret_rejected' | 'personal_data_rejected' };

export function scanBody(text: string): ScanVerdict {
  if (SECRET_PATTERNS.some(pattern => pattern.test(text)))
    return { ok: false, code: 'secret_rejected' };
  if (PHONE.test(text)) return { ok: false, code: 'personal_data_rejected' };
  for (const match of text.matchAll(EMAIL)) {
    const domain = (match[1] ?? '').toLowerCase();
    if (!COMPANY_EMAIL_DOMAINS.has(domain))
      return { ok: false, code: 'personal_data_rejected' };
  }
  return { ok: true };
}
