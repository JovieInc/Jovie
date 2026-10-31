#!/usr/bin/env node
/**
 * Secret redactor for agent output, logs and PR text (JOV-7998).
 *
 *   some-command 2>&1 | node scripts/secrets/redact.mjs
 *   node scripts/secrets/redact.mjs --check file   # exit 1 if it would redact
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

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const checkIdx = process.argv.indexOf('--check');
  if (checkIdx > -1) {
    const text = readFileSync(process.argv[checkIdx + 1], 'utf8');
    process.exit(redact(text) === text ? 0 : 1);
  }
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => {
    buf += c;
  });
  process.stdin.on('end', () => process.stdout.write(redact(buf)));
}
