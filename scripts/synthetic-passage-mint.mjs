#!/usr/bin/env node
/**
 * Mint a canary passage token for the anonymous /start bot check (JOV-9625 /
 * JOV-10194). This is the SANCTIONED agent path: agents and production
 * certification must never lean on the JOV-10194 unverified marker budget —
 * they mint a passage token and the server verifies the Turnstile dummy
 * token in Cloudflare's official test mode for that visit only.
 *
 *   CRON_SECRET=... node scripts/synthetic-passage-mint.mjs \
 *     --run 123456 --scope onboarding_chat [--ttl 300] [--sub <canary email>]
 *
 * The key is HKDF-derived from CRON_SECRET exactly like
 * derivePassageKey in apps/web/lib/synthetic/passage-token.ts (same salt and
 * info labels) and mintPassageToken's wire format
 * `jsp1.<base64url(claims)>.<base64url(HMAC-SHA256)>`. The key itself is
 * never printed. In GitHub Actions the token is add-masked before printing.
 * `--sub` must be a production canary identity
 * (browse-ready+synthetic-prodcert-<run>@jov.ie style); without it, one is
 * derived from the run id.
 */
import { createHmac, hkdfSync, randomBytes } from 'node:crypto';

const KEY_INFO = 'jovie.synthetic-passage/v1';
const KEY_SALT = 'jovie-synthetic-passage';
const PREFIX = 'jsp1';
const MAX_TTL = 600;
const CANARY_PATTERN =
  /^browse-ready\+synthetic-prodcert-[a-z\d]{6,24}@jov\.ie$/u;
const SCOPES = new Set(['onboarding_chat', 'smartlink_click']);

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
}

function derivePassageKey(rootSecret) {
  if (!rootSecret || rootSecret.length < 16) {
    throw new Error('CRON_SECRET is missing or too short.');
  }
  return Buffer.from(hkdfSync('sha256', rootSecret, KEY_SALT, KEY_INFO, 32));
}

function mint(key, { sub, scp, run, ttl }) {
  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    sub: sub.trim().toLowerCase(),
    scp,
    iat,
    exp: iat + ttl,
    jti: randomBytes(18).toString('base64url'),
    run,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', key)
    .update(`${PREFIX}.${body}`)
    .digest()
    .toString('base64url');
  return `${PREFIX}.${body}.${signature}`;
}

function main() {
  const rawRun = arg('run') ?? `local${Date.now().toString(36)}`;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(rawRun)) {
    throw new Error('--run must be 1-64 chars of [A-Za-z0-9._-].');
  }
  const run = rawRun.slice(0, 64);
  const scp = arg('scope', 'onboarding_chat');
  if (!SCOPES.has(scp)) {
    throw new Error(`--scope must be one of: ${[...SCOPES].join(', ')}.`);
  }
  const ttl = Number(arg('ttl', '300'));
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_TTL) {
    throw new Error(`--ttl must be an integer from 1 through ${MAX_TTL}.`);
  }
  // Mirrors newProdcertUserEmail (lib/synthetic/prodcert-identities.ts).
  const slug = run
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')
    .slice(0, 24);
  const sub = arg('sub') ?? `browse-ready+synthetic-prodcert-${slug}@jov.ie`;
  if (!CANARY_PATTERN.test(sub)) {
    throw new Error(
      'Passage tokens can only be minted for canary identities ' +
        '(browse-ready+synthetic-prodcert-<run>@jov.ie).'
    );
  }

  const token = mint(derivePassageKey(process.env.CRON_SECRET ?? ''), {
    sub,
    scp,
    run,
    ttl,
  });
  if (process.env.GITHUB_ACTIONS === 'true') {
    process.stdout.write(`::add-mask::${token}\n`);
  }
  process.stdout.write(`${token}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
