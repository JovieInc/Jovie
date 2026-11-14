#!/usr/bin/env node
/**
 * Secret redactor for agent output, logs and PR text (JOV-7998).
 *
 *   some-command 2>&1 | node scripts/secrets/redact.mjs
 *   node scripts/secrets/redact.mjs --check file   # exit 1 if it would redact
 *   node scripts/secrets/redact.mjs --pr-text      # also strip personal data
 *
 * `scrubPrText` is the automatic guardrail on routine PR text (Tim White,
 * 2026-11-12: routine GitHub writes never wait on him; canon/FLEET.md#routine-writes).
 * It strips secrets plus personal email addresses and phone numbers, so a
 * public PR body or comment never needs a human to check it first.
 *
 * Pattern-based only. It never holds secret values or hashes of them, so it is
 * safe to run anywhere. It is a net, not a guarantee: the rule stays "never
 * print a secret"; this catches the slip.
 */
import { readFileSync } from 'node:fs';

const TOKEN_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\blin_(?:api|oauth)_[A-Za-z0-9]{20,}\b/g,
  /\bvck_[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bwhsec_[A-Za-z0-9]{16,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bdp\.(?:ct|st|sa|scim|audit)\.[A-Za-z0-9]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g;
const ASSIGNMENT =
  /\b([A-Za-z_][A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY|DATABASE_URL|CLIENT_SECRET)[A-Za-z0-9_]*)(\s*[=:]\s*)(["']?)[^\s"']{6,}\3/g;

export const MARK = '[REDACTED]';

export function redact(text) {
  let out = String(text);
  for (const re of TOKEN_PATTERNS) out = out.replace(re, MARK);
  out = out.replace(URL_CREDENTIALS, `$1:${MARK}@`);
  out = out.replace(BEARER, `$1 ${MARK}`);
  out = out.replace(ASSIGNMENT, (m, name, sep) => `${name}${sep}${MARK}`);
  return out;
}

export const PERSONAL_MARK = '[REDACTED-PERSONAL]';

// Addresses that identify a service or a placeholder, not a person.
const SAFE_EMAIL =
  /(?:^(?:no-?reply|notifications|support|git)@)|@(?:[a-z0-9-]+\.)*(?:noreply\.github\.com|github\.com|anthropic\.com|example\.(?:com|org|net)|[a-z0-9-]+\.(?:test|invalid|example|localhost))$/i;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Email-shaped tokens that are really file names or package refs: retina
// assets (icon@2x.png) and code-file "domains" (foo@next.js). Matched by the
// final extension only, so a real address like a@2x.co is still redacted; none
// of these extensions is a TLD a person's address would use.
const FILE_LIKE =
  /\.(?:png|jpe?g|gif|svg|webp|avif|ico|bmp|js|mjs|cjs|jsx|ts|mts|cts|tsx|json|css|scss|map|lock|ya?ml|toml|wasm)$/i;
// Grouped NANP numbers (555-123-4567, (555) 123-4567, +1 555 123 4567) and
// bare E.164 (+15551234567). Dates, SHAs and IDs have other shapes.
const PHONE =
  /(?<![\w-])(?:\+?1[\s.-])?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])|(?<![\w+])\+\d{10,15}\b/g;

export function redactPersonal(text) {
  return String(text)
    .replace(EMAIL, m =>
      SAFE_EMAIL.test(m) || FILE_LIKE.test(m) ? m : PERSONAL_MARK
    )
    .replace(PHONE, PERSONAL_MARK);
}

/** Secrets and personal data out of PR titles, bodies and comments. */
export function scrubPrText(text) {
  return redactPersonal(redact(text));
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const scrub = process.argv.includes('--pr-text') ? scrubPrText : redact;
  const checkIdx = process.argv.indexOf('--check');
  if (checkIdx > -1) {
    const text = readFileSync(process.argv[checkIdx + 1], 'utf8');
    process.exit(scrub(text) === text ? 0 : 1);
  }
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => {
    buf += c;
  });
  process.stdin.on('end', () => process.stdout.write(scrub(buf)));
}
