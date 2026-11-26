#!/usr/bin/env node
/**
 * Establish an ephemeral Playwright storageState for Golden Path Pen screenshot
 * capture of auth-required surfaces (`/app/chat`, `/billing/success`).
 *
 * Uses the deployed product's Better Auth email-OTP sign-in flow strictly for
 * sanctioned internal @jov.ie certification canaries so auth security is never
 * weakened and concurrent product-crawl E2E_PROD_USER_EMAIL OTPs never collide.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Default to the chat-health canary so `/app/chat` stays reachable for Pen
 * capture. The admitted canary is still allowlisted for billing-success and
 * other auth-required frames when explicitly passed via `--email`.
 * Unpublished or unfinished profiles redirect `/app/chat` → `/start`, which
 * the comparator correctly records as `capture-redirected-off-route`.
 */
export const DEFAULT_PEN_CAPTURE_EMAIL = 'browse-ready+chat-health@jov.ie';
export const ALLOWED_PEN_CAPTURE_EMAILS = Object.freeze([
  DEFAULT_PEN_CAPTURE_EMAIL,
  'browse-ready+canary-admitted@jov.ie',
]);

const OTP_PATTERN = /^\d{6}$/u;
const MAX_CLOCK_SKEW_MS = 30_000;
const MAX_ALLOWED_ATTEMPTS = 5;

export function isAllowedPenCaptureEmail(email) {
  if (typeof email !== 'string') return false;
  return ALLOWED_PEN_CAPTURE_EMAILS.includes(email.trim().toLowerCase());
}

export function extractFreshOtp(record, startedAtMs, nowMs = Date.now()) {
  if (!record || typeof record.value !== 'string') return null;
  const createdAtMs = new Date(record.created_at).getTime();
  const expiresAtMs = new Date(record.expires_at).getTime();
  if (
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    createdAtMs < startedAtMs - MAX_CLOCK_SKEW_MS ||
    expiresAtMs <= nowMs
  ) {
    return null;
  }
  const sep = record.value.lastIndexOf(':');
  if (sep <= 0) return null;
  const otp = record.value.slice(0, sep);
  const attempts = record.value.slice(sep + 1);
  if (
    !OTP_PATTERN.test(otp) ||
    !/^\d+$/u.test(attempts) ||
    Number(attempts) >= MAX_ALLOWED_ATTEMPTS
  ) {
    return null;
  }
  return otp;
}

function defaultLoadLatestVerification(databaseUrl) {
  const requireFromWeb = createRequire(
    new URL('../../apps/web/package.json', import.meta.url)
  );
  const { neon } = requireFromWeb('@neondatabase/serverless');
  const sql = neon(databaseUrl);
  return async (email, startedAtMs) => {
    const identifier = `sign-in-otp-${email.trim().toLowerCase()}`;
    const freshAfter = new Date(startedAtMs - MAX_CLOCK_SKEW_MS);
    const rows = await sql`
      SELECT value, created_at, expires_at
      FROM ba_verifications
      WHERE identifier = ${identifier}
        AND created_at >= ${freshAfter}
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  };
}

export async function waitForVerificationOtp({
  email,
  startedAtMs,
  loadRecord,
  timeoutMs = 20_000,
  pollMs = 750,
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const otp = extractFreshOtp(
      await loadRecord(email, startedAtMs),
      startedAtMs
    );
    if (otp) return otp;
    await new Promise(done => setTimeout(done, pollMs));
  }
  throw new Error(`Timed out waiting for Better Auth OTP for ${email}.`);
}

/**
 * @param {{
 *   origin?: string,
 *   outPath?: string,
 *   email?: string,
 *   databaseUrl?: string,
 *   loadRecord?: (email: string, startedAtMs: number) => Promise<any>,
 *   newRequestContext?: (opts: Record<string, unknown>) => Promise<any>,
 * }} options
 */
export async function mintPenCaptureStorageState({
  origin = 'https://jov.ie',
  outPath,
  email = DEFAULT_PEN_CAPTURE_EMAIL,
  databaseUrl = process.env.DATABASE_URL ?? '',
  loadRecord,
  newRequestContext,
} = {}) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isAllowedPenCaptureEmail(normalizedEmail)) {
    throw new Error(`Refusing non-canary Pen capture identity: ${email}`);
  }
  if (!loadRecord && !databaseUrl.trim()) {
    throw new Error('Pen capture session requires DATABASE_URL.');
  }
  const canonicalOrigin = new URL(origin).origin;
  const createContext =
    newRequestContext ??
    (async opts => {
      const { request } = await import('playwright');
      return request.newContext(opts);
    });
  const api = await createContext({
    baseURL: canonicalOrigin,
    extraHTTPHeaders: {
      origin: canonicalOrigin,
      'x-synthetic-monitoring': 'pen-golden-path',
    },
  });
  try {
    const startedAtMs = Date.now();
    const send = await api.post('/api/auth/email-otp/send-verification-otp', {
      data: { email: normalizedEmail, type: 'sign-in' },
    });
    if (!send.ok()) {
      throw new Error(`Pen capture OTP send failed: HTTP ${send.status()}`);
    }
    const otp = await waitForVerificationOtp({
      email: normalizedEmail,
      startedAtMs,
      loadRecord:
        loadRecord ?? defaultLoadLatestVerification(databaseUrl.trim()),
    });
    const signIn = await api.post('/api/auth/sign-in/email-otp', {
      data: { email: normalizedEmail, otp },
    });
    if (!signIn.ok()) {
      throw new Error(
        `Pen capture OTP sign-in failed: HTTP ${signIn.status()}`
      );
    }
    const state = await api.storageState();
    if (!Array.isArray(state.cookies) || state.cookies.length === 0) {
      throw new Error('Pen capture sign-in returned no session cookies.');
    }
    if (outPath) {
      const resolved = resolve(outPath);
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      chmodSync(resolved, 0o600);
    }
    return state;
  } finally {
    await api.dispose();
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const argv = process.argv.slice(2);
  const arg = name => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const outPath = arg('out');
  if (!outPath) {
    process.stderr.write(
      'usage: pen-capture-auth.mjs --out FILE [--origin https://jov.ie] [--email EMAIL]\n'
    );
    process.exit(64);
  }
  mintPenCaptureStorageState({
    origin: arg('origin') ?? 'https://jov.ie',
    outPath,
    email: arg('email') ?? DEFAULT_PEN_CAPTURE_EMAIL,
  })
    .then(() => {
      process.stdout.write('Established ephemeral Pen capture session.\n');
    })
    .catch(error => {
      process.stderr.write(`${error?.message ?? error}\n`);
      process.exit(1);
    });
}
