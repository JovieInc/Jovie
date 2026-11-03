/**
 * Production golden-path certification (JOV-9625).
 *
 * Pure receipt logic plus HTTP probes for the anonymous surfaces. Browser
 * steps (returning sign-in, new-user signup, onboarding, chat, checkout entry)
 * come from the post-deploy Playwright run as a steps file and are folded in
 * here, so one receipt per surface is built from every kind of evidence.
 * Receipts are SHA-bound to /api/health/build-info and carry per-check
 * timestamps. A surface that was not exercised is `blocked` with a reason,
 * never silently passed.
 */

export const RECEIPT_SCHEMA = 'jovie.prod-golden-path-receipt/v1';

/** Launch order. screenIds come from the JOV-INV-018 screen registry. */
export const SURFACES = Object.freeze({
  landing: { screenIds: ['web.homepage'], identity: 'anonymous' },
  'signup-signin': {
    screenIds: ['web.signin', 'web.signup'],
    identity: 'creator-ready',
  },
  claim: { screenIds: ['web.claim', 'web.start'], identity: 'anonymous' },
  onboarding: { screenIds: ['web.onboarding'], identity: 'creator-ready' },
  chat: { screenIds: ['web.chat'], identity: 'creator-ready' },
  'public-profile': {
    screenIds: ['web.public-profile'],
    identity: 'anonymous',
  },
  smartlink: { screenIds: ['web.smartlink-release'], identity: 'anonymous' },
  checkout: {
    screenIds: ['web.onboarding-checkout'],
    identity: 'creator-ready',
  },
});

export const SURFACE_IDS = Object.keys(SURFACES);

const ERROR_TEXT =
  /application error|something went wrong|internal server error|this page could not be found/i;

export function statusFromChecks(checks) {
  if (checks.some(c => c.status === 'failed')) return 'failed';
  if (checks.length === 0 || checks.some(c => c.status === 'blocked')) {
    return 'blocked';
  }
  return 'passed';
}

/**
 * @param {{ surface: string, checks: any[], sha: any, deploymentId?: any, runUrl?: any, startedAt: any, endedAt: any, identity?: any, observations?: any[], consoleErrorCount?: number | null, networkErrorCount?: number | null, screenshot?: { format: string, dataUrl: string } | null, adminInventoryReadback?: { status: string, detail: string } | null }} input
 */
export function buildReceipt({
  surface,
  checks,
  sha,
  deploymentId = null,
  runUrl = null,
  startedAt,
  endedAt,
  identity,
  observations = [],
  consoleErrorCount = null,
  networkErrorCount = null,
  screenshot = null,
  adminInventoryReadback = null,
}) {
  const meta = SURFACES[surface];
  if (!meta) throw new Error(`unknown surface ${surface}`);
  const status = statusFromChecks(checks);
  const blockedReasons = checks
    .filter(c => c.status === 'blocked')
    .map(c => `${c.id}: ${c.summary}`);
  return {
    schema: RECEIPT_SCHEMA,
    surface,
    status,
    sha,
    deploymentId,
    startedAt,
    endedAt,
    runUrl,
    screenIds: meta.screenIds,
    identity: identity ?? meta.identity,
    checks: checks.map(c => ({
      ...c,
      summary: String(c.summary).slice(0, 1_500),
    })),
    blocker:
      status === 'blocked'
        ? (blockedReasons.join('; ') || 'No checks ran.').slice(0, 1_900)
        : null,
    issueUrl: null,
    observations,
    // Per-surface browser evidence (JOV-9625): null when the surface was not
    // browser-exercised, so "not measured" is never presented as a clean zero.
    consoleErrorCount,
    networkErrorCount,
    screenshot,
    adminInventoryReadback,
  };
}

/** Time one check. Never throws: an exception is a failed check. */
export async function runCheck(id, fn, now = () => new Date().toISOString()) {
  const startedAt = now();
  try {
    const outcome = await fn();
    const status = outcome?.status ?? 'passed';
    return {
      id,
      status,
      startedAt,
      endedAt: now(),
      summary: outcome?.summary ?? 'ok',
    };
  } catch (error) {
    return {
      id,
      status: 'failed',
      startedAt,
      endedAt: now(),
      summary: String(error?.message ?? error).split('\n')[0],
    };
  }
}

async function get(origin, path, fetchImpl, init = {}) {
  const response = await fetchImpl(new URL(path, origin), {
    redirect: 'follow',
    headers: { 'user-agent': 'jovie-prod-cert/1 (+synthetic)' },
    ...init,
  });
  const body = await response.text();
  return { response, body };
}

function expectOk({ response, body }, what) {
  if (response.status !== 200)
    throw new Error(`${what}: HTTP ${response.status}`);
  if (ERROR_TEXT.test(body.slice(0, 200_000)))
    throw new Error(`${what}: error text rendered`);
}

async function ogImageCheck(origin, html, fetchImpl, what) {
  const match = html.match(
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i
  );
  if (!match) throw new Error(`${what}: no og:image meta`);
  const image = await fetchImpl(
    new URL(match[1].replace(/&amp;/g, '&'), origin),
    {
      redirect: 'follow',
    }
  );
  const type = image.headers.get('content-type') ?? '';
  if (image.status !== 200 || !type.startsWith('image/')) {
    throw new Error(`${what}: og:image HTTP ${image.status} ${type}`);
  }
  await image.arrayBuffer();
  return `og:image ${type}`;
}

/**
 * Anonymous HTTP checks per surface, in launch order.
 * @param {{ origin: string, fetchImpl?: typeof fetch, now?: any, profileHandle?: string, env?: Record<string, string | undefined> }} options
 */
export function anonymousChecks({
  origin,
  fetchImpl = fetch,
  now,
  profileHandle = 'tim',
  env = {},
}) {
  const run = (id, fn) => runCheck(id, fn, now);
  const takenHandle = env.PROD_CERT_TAKEN_HANDLE || profileHandle;
  return {
    landing: () => [
      run('landing-renders', async () => {
        const page = await get(origin, '/', fetchImpl);
        expectOk(page, 'GET /');
        if (!/<title>[^<]{3,}/i.test(page.body))
          throw new Error('GET /: empty title');
      }),
    ],
    'signup-signin': () => [
      run('signin-form-renders', async () => {
        const page = await get(origin, '/signin', fetchImpl);
        expectOk(page, 'GET /signin');
        if (!/type="email"|name="email"/i.test(page.body))
          throw new Error('GET /signin: no email field');
      }),
      run('signup-renders', async () => {
        expectOk(await get(origin, '/signup', fetchImpl), 'GET /signup');
      }),
    ],
    claim: () => [
      run('claim-renders', async () => {
        expectOk(await get(origin, '/claim', fetchImpl), 'GET /claim');
      }),
      run('claim-param-renders', async () => {
        expectOk(
          await get(origin, '/claim?claim=1', fetchImpl),
          'GET /claim?claim=1'
        );
      }),
      run('start-renders', async () => {
        expectOk(await get(origin, '/start', fetchImpl), 'GET /start');
      }),
      run('taken-handle-rejected', async () => {
        const { response, body } = await get(
          origin,
          `/api/handle/check?handle=${encodeURIComponent(takenHandle)}`,
          fetchImpl
        );
        const json = JSON.parse(body);
        if (
          response.status !== 200 ||
          json.available !== false ||
          json.reason !== 'taken'
        ) {
          throw new Error(
            `taken handle /${takenHandle} reported ${JSON.stringify(json).slice(0, 200)}`
          );
        }
      }),
      run('free-handle-accepted', async () => {
        const free = `prodcert-free-${Date.now().toString(36)}`;
        const { response, body } = await get(
          origin,
          `/api/handle/check?handle=${free}`,
          fetchImpl
        );
        const json = JSON.parse(body);
        if (response.status !== 200 || json.available !== true) {
          throw new Error(
            `free handle reported ${JSON.stringify(json).slice(0, 200)}`
          );
        }
      }),
    ],
    'public-profile': () => [
      run('profile-renders', async () => {
        const page = await get(origin, `/${profileHandle}`, fetchImpl);
        expectOk(page, `GET /${profileHandle}`);
        if (!/<h1/i.test(page.body))
          throw new Error(`GET /${profileHandle}: no h1`);
      }),
      run('profile-og-image', async () => {
        const page = await get(origin, `/${profileHandle}`, fetchImpl);
        expectOk(page, `GET /${profileHandle}`);
        return {
          summary: await ogImageCheck(
            origin,
            page.body,
            fetchImpl,
            `/${profileHandle}`
          ),
        };
      }),
    ],
    smartlink: () => [
      run('release-link-resolves', async () => {
        const profile = await get(origin, `/${profileHandle}`, fetchImpl);
        const links = [
          ...new Set(
            [
              ...profile.body.matchAll(
                new RegExp(`href="(/${profileHandle}/[a-z0-9-]+)"`, 'gi')
              ),
            ].map(m => m[1])
          ),
        ];
        if (links.length === 0)
          throw new Error(`/${profileHandle} links no release smartlink`);
        const page = await get(origin, links[0], fetchImpl);
        expectOk(page, `GET ${links[0]}`);
        if (/coming soon/i.test(page.body.slice(0, 5_000))) {
          throw new Error(`${links[0]} lands on a Coming soon placeholder`);
        }
        return {
          summary: `${links[0]} -> ${page.response.url ? new URL(page.response.url).pathname : links[0]}`,
        };
      }),
      run('release-og-image', async () => {
        const profile = await get(origin, `/${profileHandle}`, fetchImpl);
        const link = profile.body.match(
          new RegExp(`href="(/${profileHandle}/[a-z0-9-]+)"`, 'i')
        )?.[1];
        if (!link) throw new Error('no release smartlink to inspect');
        const page = await get(origin, link, fetchImpl);
        return {
          summary: await ogImageCheck(origin, page.body, fetchImpl, link),
        };
      }),
    ],
  };
}

/**
 * Fold browser steps into checks. A steps file is a list of
 * { surface, id, status, startedAt, endedAt, summary } written by the
 * post-deploy Playwright run; `authStatus` covers the case where the run was
 * skipped (no credentials) or never produced steps.
 */
export function stepChecks(
  steps,
  authStatus,
  now = () => new Date().toISOString()
) {
  const bySurface = {};
  const observationsBySurface = {};
  const telemetryBySurface = {};
  const screenshotBySurface = {};
  let readback = null;
  for (const step of steps ?? []) {
    if (step.kind === 'observation') {
      (observationsBySurface[step.surface] ??= []).push({
        contractId: step.contractId,
        dimension: step.dimension,
        value: step.value,
        unit: step.unit,
        sampleSize: step.sampleSize ?? 1,
      });
      continue;
    }
    if (step.kind === 'telemetry') {
      telemetryBySurface[step.surface] = {
        consoleErrorCount: step.consoleErrors,
        networkErrorCount: step.networkErrors,
      };
      continue;
    }
    if (step.kind === 'screenshot') {
      screenshotBySurface[step.surface] = {
        format: step.format,
        dataUrl: step.dataUrl,
      };
      continue;
    }
    if (step.kind === 'readback') {
      // One admin inventory-readback attempt per run; the latest wins.
      readback = {
        status: step.status,
        detail: step.detail,
      };
      continue;
    }
    // A Playwright retry re-records the same check. The latest attempt is
    // the verdict, so one failed attempt followed by a pass is one passed
    // check, not a failed surface (JOV-9822).
    const checks = (bySurface[step.surface] ??= []);
    const record = {
      id: step.id,
      status: step.status,
      startedAt: step.startedAt,
      endedAt: step.endedAt,
      summary: step.summary ?? '',
    };
    const prior = checks.findIndex(c => c.id === step.id);
    if (prior === -1) checks.push(record);
    else if (Date.parse(record.endedAt) >= Date.parse(checks[prior].endedAt)) {
      checks[prior] = record;
    }
  }
  return {
    bySurface,
    observationsBySurface,
    telemetryBySurface,
    screenshotBySurface,
    adminInventoryReadback: readback,
    authStatus,
    now,
  };
}

/** The browser-owned checks every surface is expected to carry. */
export const EXPECTED_BROWSER_CHECKS = Object.freeze({
  'signup-signin': ['returning-user-email-otp', 'new-user-email-otp'],
  claim: [
    'claimed-profile-owned',
    'start-chat-first-reply',
    'golden-path-preview-has-release',
  ],
  onboarding: ['dashboard-first-value', 'fresh-user-onboarding-first-value'],
  chat: ['composer-ready', 'first-reply'],
  'public-profile': [
    'owned-profile-renders-publicly',
    'profile-edit-save-readback',
  ],
  smartlink: ['click-analytics-capture'],
  checkout: ['checkout-entry-renders'],
});

export function missingBrowserChecks({ surface, present, authStatus, now }) {
  const expected = EXPECTED_BROWSER_CHECKS[surface] ?? [];
  const at = now();
  return expected
    .filter(id => !present.some(c => c.id === id))
    .map(id => ({
      id,
      status: 'blocked',
      startedAt: at,
      endedAt: at,
      summary:
        authStatus === 'not-configured'
          ? 'sanctioned production identity (E2E_PROD_USER_EMAIL + DATABASE_URL in Doppler jovie-web/prd) is not configured for this run'
          : `browser step did not run (auth smoke ${authStatus || 'unknown'})`,
    }));
}

export async function readServedBuild(origin, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/health/build-info', origin));
  if (response.status !== 200)
    throw new Error(`build-info HTTP ${response.status}`);
  /** @type {any} */
  const json = await response.json();
  if (!/^[0-9a-f]{40}$/.test(json.commitSha ?? ''))
    throw new Error('build-info has no commit sha');
  return { sha: json.commitSha, deploymentId: json.deploymentId ?? null };
}

/**
 * Build one receipt per surface in launch order.
 */
export async function runProductionCertification({
  origin = 'https://jov.ie',
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  steps = [],
  authStatus = 'unknown',
  runUrl = null,
  expectedSha = null,
  profileHandle = 'tim',
  env = {},
} = {}) {
  const served = await readServedBuild(origin, fetchImpl);
  const stepState = stepChecks(steps, authStatus, now);
  const probes = anonymousChecks({
    origin,
    fetchImpl,
    now,
    profileHandle,
    env,
  });
  const receipts = [];
  for (const surface of SURFACE_IDS) {
    const startedAt = now();
    let checks = [];
    if (expectedSha && served.sha !== expectedSha) {
      const at = now();
      checks = [
        {
          id: 'served-sha-matches-promotion',
          status: 'blocked',
          startedAt: at,
          endedAt: at,
          summary: `production serves ${served.sha.slice(0, 8)}, promotion was ${expectedSha.slice(0, 8)}; no evidence recorded for the promoted build`,
        },
      ];
    } else {
      if (probes[surface])
        checks.push(...(await Promise.all(probes[surface]())));
      const present = stepState.bySurface[surface] ?? [];
      checks.push(...present);
      checks.push(
        ...missingBrowserChecks({ surface, present, authStatus, now })
      );
    }
    receipts.push(
      buildReceipt({
        surface,
        checks,
        sha: served.sha,
        deploymentId: served.deploymentId,
        runUrl,
        startedAt,
        endedAt: now(),
        observations: stepState.observationsBySurface[surface] ?? [],
        consoleErrorCount:
          stepState.telemetryBySurface[surface]?.consoleErrorCount ?? null,
        networkErrorCount:
          stepState.telemetryBySurface[surface]?.networkErrorCount ?? null,
        screenshot: stepState.screenshotBySurface[surface] ?? null,
        // One readback per run, carried on the front-door receipt only.
        adminInventoryReadback:
          surface === 'landing'
            ? (stepState.adminInventoryReadback ?? null)
            : undefined,
      })
    );
  }
  return { served, receipts };
}

/**
 * One verdict for everything that depends on the production golden path
 * (recovery email gate, marketplace listing, launch certification): every
 * surface passed on the served SHA within the freshness window.
 * @param {any[]} receipts
 * @param {{ servedSha: string, nowMs?: number, maxAgeMs?: number }} options
 */
export function certificationVerdict(
  receipts,
  { servedSha, nowMs = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000 }
) {
  const bySurface = new Map(receipts.map(r => [r.surface, r]));
  const notGreen = [];
  for (const surface of SURFACE_IDS) {
    const r = bySurface.get(surface);
    if (!r) notGreen.push({ surface, why: 'no receipt' });
    else if (r.status !== 'passed') notGreen.push({ surface, why: r.status });
    else if (r.sha !== servedSha)
      notGreen.push({ surface, why: `passed on ${r.sha.slice(0, 8)}` });
    else if (nowMs - Date.parse(r.endedAt) > maxAgeMs)
      notGreen.push({ surface, why: 'older than 24h' });
  }
  return { certified: notGreen.length === 0, servedSha, notGreen };
}
