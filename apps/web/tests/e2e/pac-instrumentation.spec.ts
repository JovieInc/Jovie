import { expect, test } from '@playwright/test';

/**
 * PAC instrumentation — spec AC-12 (issue #13063, parent #13060).
 *
 * Scripted pass over the full PAC event sequence
 * (exposure → play → 30s → prompt → error → success → S2 click),
 * verifying every event lands in the first-party sink
 * (`/api/profile/pac-event`) with the full payload contract:
 * jv_aid (server-derived), profile_id, pac_state, variant_id, session_id.
 *
 * The play/capture UI ships with the PAC state machine (#13061); until it
 * lands, this spec drives the emitter contract directly from a real profile
 * page context, so the client → sink pipeline (payload shape, consent field,
 * acceptance) is exercised end-to-end.
 *
 * Anonymous visitor; no auth.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const PROFILE_HANDLE = process.env.SMOKE_PROFILE_HANDLE ?? 'timwhite';

const VARIANT_ID = 'copy:default|trigger:30s|s2:merch|tab:visible|dismiss:text';

type ScriptedEvent = {
  readonly event: string;
  readonly pacState: string;
  readonly extras?: Record<string, string | number | boolean>;
};

// AC-12 sequence: exposure → play → 30s → prompt → error → success → S2
// click — expanded to cover every client event in the schema.
const SEQUENCE: readonly ScriptedEvent[] = [
  { event: 'pac_exposure', pacState: 'idle' },
  { event: 'pac_play_start', pacState: 'playing' },
  {
    event: 'pac_play_30s',
    pacState: 'playing',
    extras: { played_ms: 30_000 },
  },
  { event: 'pac_play_complete', pacState: 'playing' },
  { event: 'capture_prompt_shown', pacState: 'prompt' },
  {
    event: 'capture_channel_toggle',
    pacState: 'prompt',
    extras: { channel: 'sms' },
  },
  { event: 'capture_submit', pacState: 'submitting' },
  {
    event: 'capture_error',
    pacState: 'error',
    extras: { rule: 'invalid_email' },
  },
  { event: 'capture_submit', pacState: 'submitting' },
  { event: 'capture_success', pacState: 'success' },
  { event: 'capture_dismiss', pacState: 'dismissed' },
  {
    event: 'pac_secondary_click',
    pacState: 'merch',
    extras: { slot: 'merch' },
  },
];

test('PAC sink accepts the scripted event sequence with full payloads', async ({
  page,
}) => {
  test.setTimeout(60_000);

  const sinkPayloads: Array<Record<string, unknown>> = [];
  await page.route('**/api/profile/pac-event', async route => {
    const data = route.request().postDataJSON() as Record<string, unknown>;
    sinkPayloads.push(data);
    await route.continue();
  });

  const response = await page.goto(`/${PROFILE_HANDLE}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  expect(response?.status()).toBe(200);

  const sessionId = await page.evaluate(() => crypto.randomUUID());
  const profileId = await page.evaluate(() => crypto.randomUUID());

  for (const scripted of SEQUENCE) {
    const status = await page.evaluate(
      async ({ scripted, sessionId, profileId, variantId }) => {
        const payload = {
          event: scripted.event,
          jv_aid: null,
          profile_id: profileId,
          pac_state: scripted.pacState,
          variant_id: variantId,
          session_id: sessionId,
          consent: 'undecided',
          ts: Date.now(),
          ...(scripted.extras ? { extras: scripted.extras } : {}),
        };
        const res = await fetch('/api/profile/pac-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });
        return res.status;
      },
      { scripted, sessionId, profileId, variantId: VARIANT_ID }
    );

    expect(status, `${scripted.event} should be accepted by the sink`).toBe(
      204
    );
  }

  // Every scripted event reached the sink with the full payload contract.
  const scriptedAtSink = sinkPayloads.filter(
    payload => payload.session_id === sessionId
  );
  expect(scriptedAtSink.map(payload => payload.event)).toEqual(
    SEQUENCE.map(scripted => scripted.event)
  );
  for (const payload of scriptedAtSink) {
    expect(payload.profile_id).toBe(profileId);
    expect(payload.variant_id).toBe(VARIANT_ID);
    expect(payload.session_id).toBe(sessionId);
    expect(typeof payload.pac_state).toBe('string');
    expect(typeof payload.ts).toBe('number');
    expect(payload.consent).toBe('undecided');
  }

  // The sink rejects events that break the contract (unknown event name).
  const rejectedStatus = await page.evaluate(
    async ({ sessionId, profileId, variantId }) => {
      const res = await fetch('/api/profile/pac-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'not_a_pac_event',
          profile_id: profileId,
          pac_state: 'idle',
          variant_id: variantId,
          session_id: sessionId,
          consent: 'undecided',
          ts: Date.now(),
        }),
      });
      return res.status;
    },
    { sessionId, profileId, variantId: VARIANT_ID }
  );
  expect(rejectedStatus).toBe(400);
});

test('profile home rail records an organic PAC exposure marker', async ({
  page,
}) => {
  test.setTimeout(60_000);

  const response = await page.goto(`/${PROFILE_HANDLE}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  expect(response?.status()).toBe(200);

  const rail = page.getByTestId('profile-home-rail');
  if ((await rail.count()) === 0) {
    test.skip(true, 'Profile has no home rail surface to observe');
    return;
  }

  await rail.first().scrollIntoViewIfNeeded();

  // The exposure dedup marker is written to sessionStorage when the rail is
  // ≥50% visible — an observable, network-independent proof the once-per-
  // state-per-session exposure fired.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.keys(globalThis.sessionStorage).filter(key =>
            key.startsWith('jv_pac_exposed:')
          )
        ),
      { timeout: 10_000 }
    )
    .not.toEqual([]);
});
