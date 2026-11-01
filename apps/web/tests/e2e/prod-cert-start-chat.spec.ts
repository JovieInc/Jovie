import { Buffer } from 'node:buffer';
import { neon } from '@neondatabase/serverless';
import { expect, type Route, test } from '@playwright/test';
import { CONSENT_COOKIE_NAME } from '@/lib/cookies/consent-state';
import {
  mintPassageToken,
  PASSAGE_TOKEN_HEADER,
} from '@/lib/synthetic/passage-token';
import {
  SHARED_E2E_ARTIST_POOL,
  selectUnclaimedCertArtist,
} from '@/lib/synthetic/prodcert-artist-fixture';
import { newProdcertUserEmail } from '@/lib/synthetic/prodcert-identities';
import { fillControlledInputUntilEnabled } from '../helpers/auth';
import { recordPlaywrightSensitiveValues } from '../helpers/vercel-preview';
import {
  certStep,
  certStepBlocked,
  createSurfaceTelemetry,
} from './utils/prod-cert-steps';

/**
 * Production golden path, anonymous first touch (JOV-9822).
 *
 * Runs on the canonical https://jov.ie host, where the real Turnstile keys
 * apply. The run carries a short-lived, single-use canary passage token
 * (lib/synthetic/passage-token.ts), so the server verifies the challenge in
 * Cloudflare's test mode for this visit only. The header is attached to
 * same-origin requests only; it never reaches Cloudflare or any other host.
 *
 * Certifies, on the served production SHA:
 *   - claim/start-chat-first-reply: /start accepts the first message;
 *   - claim/golden-path-preview-has-release: the preview shows at least one
 *     release from the artist's real catalog before any pricing step
 *     (JOV-9758; the recovery email gate re-runs this check id).
 *
 * The fixture artist is verified unclaimed at run time (JOV-9928): the
 * dogfood Golden Path journey claims its UNMARKED fixture in production, and
 * the server answers any anonymous first touch on an artist whose Spotify id
 * already has a creator_profiles row with ownership_conflict:v1. Each run
 * probes creator_profiles read-only — the same predicate as
 * hasSpotifyProfileIdentityConflict — and uses the first pool candidate with
 * no bound row; if none is unclaimed the claim steps block with that exact
 * reason. No account, claim or profile is created; the anonymous session is
 * tagged synthetic (automation user agent + x-synthetic-monitoring).
 *
 * Also certifies smartlink/click-analytics-capture: one release-link click is
 * recorded by /api/track and read back from the database as `is_bot = true`
 * with the synthetic passage tag in metadata, so it is captured end to end,
 * tagged synthetic by a server-validated canary token, and excluded from
 * every customer metric. The marketing-consent cookie is declined, so no
 * audience member is created.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const ORIGIN = process.env.PROD_CERT_START_ORIGIN ?? 'https://jov.ie';

/**
 * Candidate fixture artists, in pool order (JOV-9928). UNMARKED stays first
 * for continuity; the rest are real, obscure Spotify artists with verified
 * catalog releases that the dogfood Golden Path journey never claims. The
 * run picks the first candidate whose Spotify id has no creator_profiles row
 * in prod (see selectUnclaimedCertArtist).
 */
const PROD_CERT_ARTIST_POOL = SHARED_E2E_ARTIST_POOL;

function runId(): string {
  return process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
    : `local${Date.now().toString(36)}`;
}

test('anonymous /start reaches a real catalog preview on production', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const passageKey = process.env.SYNTHETIC_PASSAGE_KEY ?? '';
  const expectedSha = process.env.EXPECTED_COMMIT_SHA ?? '';
  if (!passageKey || !/^[0-9a-f]{40}$/u.test(expectedSha)) {
    const why = !passageKey
      ? 'SYNTHETIC_PASSAGE_KEY is not provided to this run'
      : 'EXPECTED_COMMIT_SHA is not provided to this run';
    certStepBlocked('claim', 'start-chat-first-reply', why);
    certStepBlocked('claim', 'golden-path-preview-has-release', why);
    return;
  }
  recordPlaywrightSensitiveValues([passageKey]);

  const buildInfo = await page.request.get(`${ORIGIN}/api/health/build-info`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(buildInfo.status()).toBe(200);
  const servedSha = ((await buildInfo.json()) as { commitSha?: string })
    .commitSha;
  if (servedSha !== expectedSha) {
    const why = `${ORIGIN} serves ${String(servedSha).slice(0, 8)}, run expected ${expectedSha.slice(0, 8)}`;
    certStepBlocked('claim', 'start-chat-first-reply', why);
    certStepBlocked('claim', 'golden-path-preview-has-release', why);
    return;
  }

  // JOV-9928: verify the fixture artist is unclaimed before use, read-only.
  // The same predicate that emits ownership_conflict:v1 — any creator_profiles
  // row bound to the artist's Spotify id — decides here, so the run either
  // starts from a guaranteed-unclaimed artist or blocks the claim steps with
  // the exact reason. The confirm_artist assertion below stays unchanged.
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl) {
    const why =
      'DATABASE_URL is not provided to this run, so the fixture artist cannot be verified unclaimed';
    certStepBlocked('claim', 'start-chat-first-reply', why);
    certStepBlocked('claim', 'golden-path-preview-has-release', why);
    return;
  }
  const probeSql = neon(databaseUrl);
  const TEST_ARTIST = await selectUnclaimedCertArtist(
    PROD_CERT_ARTIST_POOL,
    async spotifyId => {
      const rows =
        await probeSql`SELECT 1 FROM creator_profiles WHERE spotify_id = ${spotifyId} LIMIT 1`;
      return rows.length > 0;
    }
  ).catch((error: unknown) => {
    const why = String((error as Error)?.message ?? error);
    certStepBlocked('claim', 'start-chat-first-reply', why);
    certStepBlocked('claim', 'golden-path-preview-has-release', why);
    return null;
  });
  if (!TEST_ARTIST) return;

  const token = mintPassageToken(Buffer.from(passageKey, 'base64url'), {
    sub: newProdcertUserEmail(runId()),
    scp: 'onboarding_chat',
    run: runId().slice(0, 64),
    ttlSeconds: 300,
  });
  recordPlaywrightSensitiveValues([token]);

  const origin = new URL(ORIGIN).origin;
  const telemetry = createSurfaceTelemetry(page);
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) {
      await route.continue();
      return;
    }
    await route.continue({
      headers: {
        ...request.headers(),
        [PASSAGE_TOKEN_HEADER]: token,
        'x-synthetic-monitoring': 'prod-cert',
      },
    });
  });

  await page.goto(`${ORIGIN}/start`, { waitUntil: 'domcontentloaded' });
  const input = page.locator('[aria-label="Chat message input" i]');
  const sendButton = page.getByRole('button', { name: 'Send message' });

  const firstReply = await certStep(
    'claim',
    'start-chat-first-reply',
    async () => {
      await expect(input).toBeVisible({ timeout: 30_000 });
      await fillControlledInputUntilEnabled(input, sendButton, TEST_ARTIST.url);
      const [response] = await Promise.all([
        page.waitForResponse(
          candidate =>
            candidate.request().method() === 'POST' &&
            new URL(candidate.url()).pathname === '/api/chat',
          { timeout: 60_000 }
        ),
        sendButton.click(),
      ]);
      if (response.status() !== 200) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `/api/chat HTTP ${response.status()} ${body.slice(0, 160)}`
        );
      }
      await expect(page.getByText("We couldn't start your chat")).toHaveCount(
        0
      );
      return response.headers()['x-onboarding-fallback'] ?? 'llm';
    },
    route => `/start first message accepted (${route.split(':')[0]})`
  );

  await certStep(
    'claim',
    'golden-path-preview-has-release',
    async () => {
      expect(firstReply).toMatch(/^confirm_artist:/);
      await expect(
        page
          .getByText(TEST_ARTIST.name, { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible({ timeout: 60_000 });
      const rail = page
        .locator(
          '[data-testid="onboarding-profile-rail"], [data-testid="onboarding-profile-rail-inline"]'
        )
        .filter({ visible: true })
        .first();
      let releases = 0;
      await expect
        .poll(
          async () => {
            releases = Number(
              (await rail.getAttribute('data-catalog-releases')) ?? 0
            );
            return releases;
          },
          { timeout: 60_000, message: 'preview showed no real release' }
        )
        .toBeGreaterThanOrEqual(1);
      const checkoutLinks = await page
        .locator('a[href^="/onboarding/checkout"]')
        .count();
      expect(checkoutLinks, 'pricing rendered before the preview').toBe(0);
      return releases;
    },
    releases =>
      `preview shows ${releases} real releases for the test artist, no pricing step`
  );

  telemetry.record('claim');
  await telemetry.capture(page, 'claim');
});

test('a release smartlink click is captured and excluded from customer analytics', async ({
  page,
  request,
}) => {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const passageKey = process.env.SYNTHETIC_PASSAGE_KEY ?? '';
  const handle = process.env.PROD_CERT_PROFILE_HANDLE ?? 'tim';
  if (!databaseUrl || !passageKey) {
    certStepBlocked(
      'smartlink',
      'click-analytics-capture',
      !databaseUrl
        ? 'DATABASE_URL is not provided to this run, so the click cannot be read back'
        : 'SYNTHETIC_PASSAGE_KEY is not provided to this run, so the click cannot be tagged synthetic'
    );
    return;
  }
  recordPlaywrightSensitiveValues([passageKey]);

  const clickToken = mintPassageToken(Buffer.from(passageKey, 'base64url'), {
    sub: newProdcertUserEmail(runId()),
    scp: 'smartlink_click',
    run: runId().slice(0, 64),
    ttlSeconds: 300,
  });
  recordPlaywrightSensitiveValues([clickToken]);

  let smartlinkSlug = '';
  await certStep(
    'smartlink',
    'click-analytics-capture',
    async () => {
      const profile = await request.get(`${ORIGIN}/${handle}`);
      expect(profile.status()).toBe(200);
      const slug = (await profile.text()).match(
        new RegExp(`href="/${handle}/([a-z0-9-]+)"`, 'i')
      )?.[1];
      if (!slug) throw new Error(`/${handle} links no release smartlink`);
      smartlinkSlug = slug;

      const click = await request.post(`${ORIGIN}/api/track`, {
        headers: {
          'x-synthetic-monitoring': 'prod-cert',
          [PASSAGE_TOKEN_HEADER]: clickToken,
          cookie: `${CONSENT_COOKIE_NAME}=${encodeURIComponent(
            JSON.stringify({
              essential: true,
              analytics: false,
              marketing: false,
            })
          )}`,
        },
        data: {
          handle,
          linkType: 'listen',
          target: 'spotify',
          context: {
            contentType: 'release',
            provider: 'spotify',
            smartLinkSlug: slug,
          },
        },
      });
      if (click.status() !== 200) {
        throw new Error(`/api/track HTTP ${click.status()}`);
      }
      const { id } = (await click.json()) as { id?: string };
      if (!id) throw new Error('/api/track returned no click id');

      const rows = (await neon(databaseUrl)`
        SELECT is_bot, audience_member_id, metadata ->> 'synthetic' AS synthetic
        FROM click_events WHERE id = ${id}
      `) as {
        is_bot: boolean;
        audience_member_id: string | null;
        synthetic: string | null;
      }[];
      if (rows.length !== 1) throw new Error('click was not persisted');
      if (rows[0].is_bot !== true) {
        throw new Error('synthetic click was not classified as a bot');
      }
      if (rows[0].synthetic !== 'prodcert') {
        throw new Error('click was not tagged with the synthetic passage tag');
      }
      if (rows[0].audience_member_id !== null) {
        throw new Error('synthetic click created an audience member');
      }
      return slug;
    },
    slug =>
      `/${handle}/${slug} click persisted as is_bot=true, tagged synthetic, no audience member`
  );

  // JOV-9625 outcome receipt: render the release page in a real browser so
  // the smartlink receipt carries console/network counts and a screenshot.
  const telemetry = createSurfaceTelemetry(page);
  await page.goto(`${ORIGIN}/${handle}/${smartlinkSlug}`, {
    waitUntil: 'domcontentloaded',
  });
  expect(page.url(), 'release page must render for the browser').toContain(
    smartlinkSlug
  );
  telemetry.record('smartlink');
  await telemetry.capture(page, 'smartlink');
});

test('the landing surface renders in a real browser for the receipt evidence', async ({
  page,
}) => {
  // JOV-9625 outcome receipt: the landing surface already has anonymous HTTP
  // probes in scripts/prod-cert.mjs; this visit adds the browser evidence —
  // per-surface console/network counts and one screenshot — without turning
  // the receipt's verdict on them.
  test.setTimeout(90_000);
  const telemetry = createSurfaceTelemetry(page);
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/./);
  telemetry.record('landing');
  await telemetry.capture(page, 'landing');
});
