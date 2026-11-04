#!/usr/bin/env node
// Golden-path walk recorder (golden-path cert, 2026-10-31).
//
// Walks production as a canary visitor and writes the dogfood-judge run
// contract (scripts/dogfood-judge/ingest.mjs): steps.json, walk.webm, NN.png
// screenshots, dom/NN.txt, console.json, canary.json. The same run feeds the
// buyer-eval gate.
//
//   CRON_SECRET=… DATABASE_URL=… node scripts/golden-path-walk/walk.mjs
//     FLOW=./flow-new-user.mjs (default) | ./flow-returning.mjs
//     OUT=<dir> MOBILE=1 HANDLE=<homepage handle> REPLY1=<typed handle>
//     EMAIL=<canary> (flow-returning: browse-ready+clerk_test@jov.ie)
//
// Safety: only prodcert canary addresses (lib/synthetic/prodcert-identities.ts);
// the OTP is read from ba_verifications for that address only; the passage
// token is the same HKDF(CRON_SECRET) scheme the prod-cert specs use; the
// teardown releases shared-pool artist bindings held by canary accounts
// (same contract as releaseGoldenPathTestBindings). Run it from a host other
// than your workstation if you walk often: anonymous chat is 20 msgs/IP/hour.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPassageRoute } from '../synthetic-passage-mint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB_ROOT ?? resolve(HERE, '../../apps/web');
const require = createRequire(process.env.PW_BASE ?? join(WEB, 'package.json'));
const { chromium } = require('playwright');
// Resolved from apps/web at runtime (createRequire above); a variable keeps the
// scripts typecheck from resolving it against the repo root.
const NEON_MODULE = '@neondatabase/serverless';
const { neon } = require(NEON_MODULE);

const ORIGIN = process.env.ORIGIN ?? 'https://jov.ie';
const OUT = process.env.OUT ?? join(process.cwd(), `run-${Date.now()}`);
// Unmarked Pavement left the shared pool for the admitted canary (#24002).
const ARTIST = process.env.ARTIST ?? 'Unmarked Cars';
const ARTIST_SPOTIFY =
  process.env.ARTIST_SPOTIFY ??
  'https://open.spotify.com/artist/6TWG4bY1qzp0lJuxxFtl6F';
const STOP_AFTER = process.env.STOP_AFTER ?? '';
const VIEWPORT = process.env.MOBILE
  ? { width: 390, height: 844 }
  : { width: 1440, height: 900 };
const run = `gp${Date.now().toString(36)}`;
const email =
  process.env.EMAIL ?? `browse-ready+synthetic-prodcert-${run}@jov.ie`;
const CANARY =
  /^browse-ready\+(?:clerk_test|synthetic-prodcert-[a-z\d]{6,24})@jov\.ie$/u;
if (!CANARY.test(email))
  throw new Error(`refusing non-canary identity ${email}`);
// Shared e2e artist pool, read from its single source of truth.
const POOL = [
  ...readFileSync(
    join(WEB, 'lib/synthetic/prodcert-artist-fixture.ts'),
    'utf8'
  ).matchAll(/spotifyId: '([A-Za-z0-9]{22})'/gu),
].map(m => m[1]);
mkdirSync(join(OUT, 'dom'), { recursive: true });
mkdirSync(join(OUT, 'video'), { recursive: true });

const sql = neon(process.env.DATABASE_URL);
async function otp(startedAt) {
  const id = `sign-in-otp-${email}`;
  for (let i = 0; i < 45; i += 1) {
    const rows =
      await sql`SELECT value, created_at FROM ba_verifications WHERE identifier = ${id} AND created_at >= ${new Date(startedAt - 30000)} AND expires_at > now() ORDER BY created_at DESC LIMIT 1`;
    if (rows[0]) return rows[0].value.slice(0, rows[0].value.lastIndexOf(':'));
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('otp timeout');
}

const browser = await chromium.launch({ headless: !process.env.HEADED });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  recordVideo: { dir: join(OUT, 'video'), size: VIEWPORT },
  userAgent: undefined,
});
const t0 = Date.now();
const page = await context.newPage();
await installPassageRoute(page, {
  origin: ORIGIN,
  rootSecret: process.env.CRON_SECRET,
  sub: email,
  run,
  extraHeaders: { 'x-synthetic-monitoring': 'prod-cert' },
});
await context
  .addCookies([
    {
      name: 'jv_cc',
      value: encodeURIComponent(
        JSON.stringify({ essential: true, analytics: false, marketing: false })
      ),
      domain: new URL(ORIGIN).hostname,
      path: '/',
    },
  ])
  .catch(() => {});

const consoleNotes = {};
let current = 'boot';
page.on('console', m => {
  if (m.type() === 'error')
    (consoleNotes[current] ??= []).push(`console: ${m.text().slice(0, 300)}`);
});
page.on('pageerror', e =>
  (consoleNotes[current] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`)
);
// The claim response decides where a new visitor lands; keep it as evidence.
page.on('response', async r => {
  if (new URL(r.url()).pathname !== '/api/onboarding/claim') return;
  const body = await r.text().catch(() => '');
  (consoleNotes[current] ??= []).push(
    `claim ${r.status()} ${body.slice(0, 400)}`
  );
});
page.on('response', r => {
  if (r.status() >= 400 && new URL(r.url()).origin === ORIGIN)
    (consoleNotes[current] ??= []).push(
      `http ${r.status()} ${new URL(r.url()).pathname}`
    );
});

const steps = [];
let n = 0;
async function snap(title, extra = {}) {
  n += 1;
  const id = String(n).padStart(2, '0');
  const shot = `${id}.png`;
  await page.screenshot({ path: join(OUT, shot) }).catch(() => {});
  const text = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  writeFileSync(join(OUT, 'dom', `${id}.txt`), text);
  steps.push({
    step: id,
    title,
    url: page.url(),
    screenshot: shot,
    video: 'walk.webm',
    videoOffsetSec: (Date.now() - t0) / 1000,
    ...extra,
  });
  process.stderr.write(
    `[${id}] ${((Date.now() - t0) / 1000).toFixed(1)}s ${title} ${page.url()}\n`
  );
  current = id;
  if (STOP_AFTER && title.startsWith(STOP_AFTER)) throw new Error('STOP');
}
const settle = (ms = 1500) => page.waitForTimeout(ms);

let failure = null;
try {
  const mod = await import(
    resolve(HERE, process.env.FLOW ?? './flow-new-user.mjs')
  );
  await mod.default({
    page,
    snap,
    settle,
    otp,
    email,
    ARTIST,
    ARTIST_SPOTIFY,
    ORIGIN,
    run,
    sql,
  });
} catch (e) {
  if (String(e.message) !== 'STOP') {
    failure = String(e.stack ?? e).slice(0, 2000);
    await snap('failure state').catch(() => {});
  }
}
await settle(1000);
await context.close();
// Teardown: free shared-pool artists claimed by canary accounts.
if (POOL.length) {
  // One HTTP transaction so the system RLS session applies to the update.
  await sql.transaction([
    sql`SELECT set_config('app.clerk_user_id', 'system_golden_path_walk', true)`,
    sql`UPDATE creator_profiles SET spotify_id = NULL, spotify_url = NULL, updated_at = now()
      WHERE spotify_id = ANY(${POOL}) AND user_id IN (
        SELECT id FROM users WHERE email LIKE 'browse-ready+synthetic-prodcert-%@jov.ie')`,
  ]);
}
await browser.close();
const vids = readdirSync(join(OUT, 'video'));
if (vids[0]) renameSync(join(OUT, 'video', vids[0]), join(OUT, 'walk.webm'));
writeFileSync(join(OUT, 'steps.json'), JSON.stringify(steps, null, 2));
writeFileSync(
  join(OUT, 'console.json'),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(consoleNotes).map(([k, v]) => [k, v.join('\n')])
    ),
    null,
    2
  )
);
writeFileSync(
  join(OUT, 'canary.json'),
  JSON.stringify(
    { identities: [email, run, 'browse-ready+synthetic-prodcert'] },
    null,
    2
  )
);
writeFileSync(
  join(OUT, 'meta.json'),
  JSON.stringify(
    {
      origin: ORIGIN,
      email,
      run,
      artist: ARTIST,
      viewport: VIEWPORT,
      failure,
      startedAt: new Date(t0).toISOString(),
    },
    null,
    2
  )
);
process.stderr.write(
  `done ${OUT} failure=${failure ? failure.split('\n')[0] : 'none'}\n`
);
