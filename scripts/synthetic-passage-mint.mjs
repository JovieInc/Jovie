#!/usr/bin/env node
/**
 * The sanctioned way for our own agents (cert, demo, QA, golden-path walks)
 * through the /start bot check in production.
 *
 *   doppler run --project jovie-web --config prd -- \
 *     node scripts/synthetic-passage-mint.mjs [--scope onboarding_chat] [--sub <canary>] [--run <id>]
 *
 * prints one canary passage token (format and checks: apps/web/lib/synthetic/
 * passage-token.ts). Send it as the `x-jovie-synthetic-passage` header on
 * every same-origin request: /start then renders Cloudflare's test sitekey
 * and /api/chat verifies in test mode. Each token is single use on
 * /api/chat, lives at most 10 minutes, is bound to a canary identity, and is
 * rate limited server-side (12/hour), so a leaked token is worth one chat.
 * Playwright callers use `installPassageRoute`, which re-mints per chat send.
 *
 * Without a token, headless agents still get through on the unverified
 * /start budget (4 fresh chats per IP per hour), which exists for real
 * people whose browsers cannot run Turnstile. Agents must not spend it.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { derivePassageKeyBase64Url } from './synthetic-passage-key.mjs';

export const PASSAGE_TOKEN_HEADER = 'x-jovie-synthetic-passage';
/** The chat-health canary (apps/web/lib/synthetic/prodcert-identities.ts). */
export const DEFAULT_PASSAGE_SUBJECT = 'browse-ready+chat-health@jov.ie';
const SCOPES = new Set(['onboarding_chat', 'smartlink_click']);

export function mintPassageTokenFromSecret(
  rootSecret,
  {
    sub = DEFAULT_PASSAGE_SUBJECT,
    scp = 'onboarding_chat',
    run = `agent${Date.now().toString(36)}`,
    ttl = 600,
  } = {}
) {
  if (!SCOPES.has(scp)) throw new Error(`unknown passage scope ${scp}`);
  if (!/^browse-ready\+[a-z0-9_-]+@jov\.ie$/u.test(sub)) {
    throw new Error(`refusing non-canary passage subject ${sub}`);
  }
  const key = Buffer.from(derivePassageKeyBase64Url(rootSecret), 'base64url');
  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    sub,
    scp,
    iat,
    exp: iat + Math.min(ttl, 600),
    jti: randomBytes(18).toString('base64url'),
    run,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', key)
    .update(`jsp1.${body}`)
    .digest()
    .toString('base64url');
  return `jsp1.${body}.${sig}`;
}

/**
 * Attach a passage token to every same-origin request of a Playwright page,
 * minting a fresh one for each /api/chat POST (tokens are single use there).
 */
export async function installPassageRoute(
  page,
  { origin, rootSecret, sub, run, extraHeaders = {} }
) {
  const mint = () =>
    mintPassageTokenFromSecret(rootSecret, {
      sub,
      run,
      scp: 'onboarding_chat',
    });
  let token = mint();
  await page.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) return route.continue();
    if (url.pathname === '/api/chat' && req.method() === 'POST') token = mint();
    return route.continue({
      headers: {
        ...req.headers(),
        ...extraHeaders,
        [PASSAGE_TOKEN_HEADER]: token,
      },
    });
  });
}

function main(argv) {
  const arg = name => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const token = mintPassageTokenFromSecret(process.env.CRON_SECRET ?? '', {
    sub: arg('sub'),
    scp: arg('scope'),
    run: arg('run'),
  });
  process.stdout.write(`${token}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
