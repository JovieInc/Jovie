import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  trackServerEvent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
}));

const {
  buildSummerFunnelResponse,
  FUNNEL_BOTTLENECK_MIN_SAMPLE,
  recordFunnelStep,
} = await import('./signup-funnel.server');
const { normalizeSignupFunnelReason, SIGNUP_FUNNEL_STEPS } = await import(
  './signup-funnel'
);

type Row = Parameters<typeof buildSummerFunnelResponse>[0][number];

const row = (
  funnelId: string,
  step: string,
  count7d: number,
  count24h = count7d,
  outcome = 'reached',
  reason: string | null = null,
  cohort: Row['cohort'] = 'customer'
): Row => ({ cohort, funnelId, step, outcome, reason, count7d, count24h });

const NOW = new Date('2026-09-26T12:00:00.000Z');

describe('recordFunnelStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trackServerEvent.mockResolvedValue({ ok: true, eventId: 'e1' });
  });

  it('writes one allowlisted funnel_step event with no identifiers', async () => {
    await recordFunnelStep({ funnel: 'fan_subscribe', step: 'profile_view' });
    expect(mocks.trackServerEvent).toHaveBeenCalledWith('funnel_step', {
      funnel_id: 'fan_subscribe',
      step: 'profile_view',
      outcome: 'reached',
      surface: 'server',
      reason: undefined,
      cohort: 'unattributed',
    });
  });

  it('keeps a normalized reason only for error and dropped outcomes', async () => {
    await recordFunnelStep({
      funnel: 'fan_subscribe',
      step: 'contact_submitted',
      outcome: 'error',
      reason: 'Validation-Error',
    });
    expect(mocks.trackServerEvent.mock.calls[0][1]).toMatchObject({
      outcome: 'error',
      reason: 'validation_error',
    });
  });

  it('ignores a step that is not in the funnel', async () => {
    await recordFunnelStep({
      funnel: 'fan_subscribe',
      step: 'auth_success' as never,
    });
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });

  it('never throws when the analytics sink throws', async () => {
    mocks.trackServerEvent.mockRejectedValue(new Error('down'));
    await expect(
      recordFunnelStep({ funnel: 'artist_signup', step: 'auth_success' })
    ).resolves.toBeUndefined();
  });
});

describe('normalizeSignupFunnelReason', () => {
  it('collapses anything that is not a short machine token to other', () => {
    expect(normalizeSignupFunnelReason('http_500')).toBe('http_500');
    expect(normalizeSignupFunnelReason('someone@example.com')).toBe('other');
    expect(normalizeSignupFunnelReason(undefined)).toBeUndefined();
  });
});

describe('buildSummerFunnelResponse', () => {
  it('reports every step in order with per-step conversion', () => {
    const response = buildSummerFunnelResponse(
      [
        row('fan_subscribe', 'profile_view', 1000, 200),
        row('fan_subscribe', 'cta_click', 100, 20),
        row('fan_subscribe', 'contact_submitted', 80, 10),
        row('fan_subscribe', 'subscribed', 60, 5),
      ],
      NOW
    );

    expect(response).toMatchObject({
      contractVersion: 'summer-funnel/v2',
      eventContract: 'signup-funnel/v2',
      observedAt: NOW.toISOString(),
      unit: 'events',
      metricScope: 'customer_only',
    });
    expect(response.windows['7d'].since).toBe('2026-09-19T12:00:00.000Z');
    expect(response.windows['24h'].since).toBe('2026-09-25T12:00:00.000Z');

    const fan = response.windows['7d'].funnels.find(
      funnel => funnel.funnelId === 'fan_subscribe'
    );
    expect(fan?.steps.map(step => step.step)).toEqual([
      ...SIGNUP_FUNNEL_STEPS.fan_subscribe,
    ]);
    expect(
      fan?.steps.map(step => [step.count, step.conversionFromPrevious])
    ).toEqual([
      [1000, null],
      [100, 0.1],
      [80, 0.8],
      [60, 0.75],
    ]);
    expect(fan?.overallConversion).toBe(0.06);
    expect(fan?.bottleneck).toEqual({
      step: 'cta_click',
      previousStep: 'profile_view',
      conversionFromPrevious: 0.1,
    });

    const fan24h = response.windows['24h'].funnels.find(
      funnel => funnel.funnelId === 'fan_subscribe'
    );
    expect(fan24h?.steps.map(step => step.count)).toEqual([200, 20, 10, 5]);
  });

  it('counts errors and drop-offs apart from reached, with top reasons', () => {
    const response = buildSummerFunnelResponse(
      [
        row('fan_subscribe', 'profile_view', 50),
        row('fan_subscribe', 'contact_submitted', 30),
        row('fan_subscribe', 'contact_submitted', 7, 7, 'error', 'rate_limit'),
        row('fan_subscribe', 'contact_submitted', 3, 3, 'error', 'invalid'),
        row('fan_subscribe', 'cta_click', 40),
        row('fan_subscribe', 'cta_click', 9, 9, 'dropped', 'flow_dismissed'),
      ],
      NOW
    );
    const steps = response.windows['7d'].funnels[0].steps;
    const submitted = steps.find(step => step.step === 'contact_submitted');
    expect(submitted).toMatchObject({
      count: 30,
      errors: 10,
      dropped: 0,
      conversionFromPrevious: 0.75,
      topReasons: [
        { reason: 'rate_limit', count: 7 },
        { reason: 'invalid', count: 3 },
      ],
    });
    expect(steps.find(step => step.step === 'cta_click')).toMatchObject({
      count: 40,
      dropped: 9,
    });
  });

  it('refuses to name a bottleneck below the minimum sample', () => {
    const small = FUNNEL_BOTTLENECK_MIN_SAMPLE - 1;
    const response = buildSummerFunnelResponse(
      [
        row('artist_signup', 'landing_view', small),
        row('artist_signup', 'cta_click', 1),
      ],
      NOW
    );
    const artist = response.windows['7d'].funnels.find(
      funnel => funnel.funnelId === 'artist_signup'
    );
    expect(artist?.bottleneck).toEqual({
      step: null,
      reason: 'insufficient_sample',
    });
  });

  it('says no_data, with null conversions, when a funnel has no events', () => {
    const response = buildSummerFunnelResponse([], NOW);
    for (const funnel of response.windows['24h'].funnels) {
      expect(funnel.bottleneck).toEqual({ step: null, reason: 'no_data' });
      expect(funnel.overallConversion).toBeNull();
      expect(funnel.steps.every(step => step.count === 0)).toBe(true);
    }
  });

  it('keeps synthetic and unclassified events out of customer windows', () => {
    const response = buildSummerFunnelResponse(
      [
        row('artist_signup', 'auth_success', 2, 1, 'reached', null, 'customer'),
        row(
          'artist_signup',
          'auth_success',
          4,
          3,
          'reached',
          null,
          'synthetic'
        ),
        row('artist_signup', 'auth_success', 8, 5, 'reached', null, null),
      ],
      NOW
    );
    const count = (windows: typeof response.windows, window: '24h' | '7d') =>
      windows[window].funnels
        .find(funnel => funnel.funnelId === 'artist_signup')
        ?.steps.find(step => step.step === 'auth_success')?.count;

    expect(count(response.windows, '7d')).toBe(2);
    expect(count(response.syntheticHealth.windows, '7d')).toBe(4);
    expect(count(response.unattributed.windows, '7d')).toBe(8);
    expect(count(response.rawWindows, '7d')).toBe(14);
    expect(count(response.windows, '24h')).toBe(1);
  });
});
