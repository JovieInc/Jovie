import { describe, expect, it } from 'vitest';
import {
  burnRate,
  claimNames,
  evaluateRegistry,
  evaluateThirdPartyGrants,
  isSecretName,
  lastUsedMonths,
  planFindings,
  validateCredentialsRegistry,
  validateSpendLedger,
} from '../credentials-registry.mjs';

const at = iso => Date.parse(iso);
const RECOVERY_EXPIRY = '2026-10-18T02:05:12.907Z';

function credentials(entries = [], stores = []) {
  return {
    schema: 'jovie.credentials-registry/v1',
    credentials: entries,
    stores,
  };
}

function spend(providers = []) {
  return { schema: 'jovie.spend-ledger/v1', providers };
}

const grant = (overrides = {}) => ({
  id: 'summer-gateway-recovery-grant',
  provider: 'summer-config',
  kind: 'grant',
  owner: 'summer-config',
  consumers: ['summer'],
  names: ['SUMMER_GATEWAY_RECOVERY_(GRANT|ENABLED)'],
  expiresAt: RECOVERY_EXPIRY,
  status: 'active',
  ...overrides,
});

const evaluate = (creds, ledger, nowIso, live) =>
  evaluateRegistry({
    credentials: creds,
    spend: ledger ?? spend(),
    nowMs: at(nowIso),
    live,
  });

describe('expiry alerts (Summer 2026-10-18 outage regression)', () => {
  it('is quiet more than 7 days out', () => {
    const { findings } = evaluate(
      credentials([grant()]),
      null,
      '2026-10-10T00:00:00Z'
    );
    expect(findings).toEqual([]);
  });

  it('alerts at 7 days with high priority', () => {
    const { findings } = evaluate(
      credentials([grant()]),
      null,
      '2026-10-11T03:00:00Z'
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fingerprint: 'credential-expiry:summer-gateway-recovery-grant:7d',
      severity: 'high',
      priority: 2,
      owner: 'summer-config',
    });
  });

  it('escalates to critical inside 1 day under a separate fingerprint', () => {
    const { findings } = evaluate(
      credentials([grant()]),
      null,
      '2026-10-17T03:00:00Z'
    );
    expect(findings[0]).toMatchObject({
      fingerprint: 'credential-expiry:summer-gateway-recovery-grant:1d',
      severity: 'critical',
      priority: 1,
    });
  });

  it('keeps alerting after expiry while the credential is active', () => {
    const { findings } = evaluate(
      credentials([grant()]),
      null,
      '2026-10-19T00:00:00Z'
    );
    expect(findings[0].fingerprint).toBe(
      'credential-expiry:summer-gateway-recovery-grant:expired'
    );
  });

  it('turns a superseded credential into a low retire item, not an expiry page', () => {
    const { findings } = evaluate(
      credentials([
        grant({ status: 'superseded', retireAction: 'set the flag false' }),
      ]),
      null,
      '2026-10-19T00:00:00Z'
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fingerprint: 'credential-hygiene:retire',
      severity: 'low',
    });
  });

  it('ignores credentials with no expiry', () => {
    const { findings } = evaluate(
      credentials([grant({ expiresAt: null })]),
      null,
      '2026-10-19T00:00:00Z'
    );
    expect(findings).toEqual([]);
  });
});

describe('spend runway and caps', () => {
  const gateway = {
    id: 'gateway',
    provider: 'vercel',
    owner: 'tim',
    snapshot: {
      observedAt: '2026-10-20T00:00:00Z',
      balanceUsd: 21,
      totalUsedUsd: 500,
    },
    burnPerDayUsd: { value: 1.4, source: 'operator-estimate' },
  };

  it('stays quiet at 15 days of runway', () => {
    const { findings, spend: rows } = evaluate(
      credentials(),
      spend([gateway]),
      '2026-10-20T01:00:00Z'
    );
    expect(findings).toEqual([]);
    expect(rows[0].runwayDays).toBe(15);
  });

  it('alerts under 14 days, critical under 7', () => {
    const high = evaluate(
      credentials(),
      spend([{ ...gateway, burnPerDayUsd: { value: 1.6 } }]),
      '2026-10-20T01:00:00Z'
    ).findings[0];
    expect(high).toMatchObject({
      fingerprint: 'spend-runway:gateway',
      severity: 'high',
      runwayDays: 13.1,
    });
    const critical = evaluate(
      credentials(),
      spend([{ ...gateway, burnPerDayUsd: { value: 3.34 } }]),
      '2026-10-20T01:00:00Z'
    ).findings[0];
    expect(critical.severity).toBe('critical');
  });

  it('measures burn from the committed snapshot and a live read', () => {
    const burn = burnRate(gateway, {
      observedAt: '2026-10-22T00:00:00Z',
      balanceUsd: 15,
      totalUsedUsd: 506,
    });
    expect(burn).toEqual({
      value: 3,
      source: 'measured-slope',
      windowDays: 2,
    });
    const { findings } = evaluate(
      credentials(),
      spend([gateway]),
      '2026-10-22T00:00:00Z',
      {
        spend: {
          gateway: {
            observedAt: '2026-10-22T00:00:00Z',
            balanceUsd: 15,
            totalUsedUsd: 506,
          },
        },
      }
    );
    expect(findings[0]).toMatchObject({
      fingerprint: 'spend-runway:gateway',
      severity: 'critical',
      runwayDays: 5,
    });
  });

  it('falls back to the declared burn when the live window is too short', () => {
    expect(
      burnRate(gateway, {
        observedAt: '2026-10-20T02:00:00Z',
        totalUsedUsd: 500.1,
      }).source
    ).toBe('operator-estimate');
  });

  it.each([
    [49, null],
    [50, 'medium'],
    [80, 'high'],
    [100, 'critical'],
  ])('cap at %i%% → %s', (percent, severity) => {
    const { findings } = evaluate(
      credentials(),
      spend([
        {
          id: 'summer',
          cap: { amountUsd: 100, period: 'month', periodKey: '2026-10' },
          snapshot: { observedAt: '2026-10-20T00:00:00Z', spentUsd: percent },
        },
      ]),
      '2026-10-20T01:00:00Z'
    );
    if (severity === null) return expect(findings).toEqual([]);
    const level = percent >= 100 ? 100 : percent >= 80 ? 80 : 50;
    expect(findings[0]).toMatchObject({
      fingerprint: `spend-cap:summer:2026-10:${level}`,
      severity,
    });
  });

  it('flags spend lines with no recent reading', () => {
    const { findings } = evaluate(
      credentials(),
      spend([
        { id: 'never', snapshot: null },
        {
          id: 'stale',
          snapshot: { observedAt: '2026-10-01T00:00:00Z', balanceUsd: 1 },
        },
      ]),
      '2026-10-20T00:00:00Z'
    );
    expect(findings[0]).toMatchObject({
      fingerprint: 'spend-measurement:unmeasured',
      items: ['never', 'stale'],
    });
  });

  it('alerts on dated credits such as banked resets', () => {
    const { findings } = evaluate(
      credentials(),
      spend([
        {
          id: 'codex-fourth',
          owner: 'gem-lanes',
          snapshot: { observedAt: '2026-10-20T00:00:00Z' },
          expiries: [
            {
              id: 'banked-reset-1',
              label: 'banked reset',
              expiresAt: '2026-10-29T19:10:07Z',
            },
          ],
        },
      ]),
      '2026-10-23T00:00:00Z'
    );
    expect(findings[0].fingerprint).toBe(
      'spend-expiry:codex-fourth:banked-reset-1:7d'
    );
  });
});

describe('hygiene', () => {
  it('classifies secret-like names', () => {
    expect(isSecretName('STRIPE_SECRET_KEY')).toBe(true);
    expect(isSecretName('DATABASE_URL')).toBe(true);
    expect(isSecretName('NEXT_PUBLIC_POSTHOG_KEY')).toBe(false);
    expect(isSecretName('APPLE_API_KEY_ID')).toBe(false);
    expect(isSecretName('SENTRY_ORG')).toBe(false);
  });

  it('flags no-owner, no-consumer, unclaimed and referenced-missing names', () => {
    const { findings, counts } = evaluate(
      credentials(
        [
          { id: 'orphan', status: 'active', consumers: ['x'], names: [] },
          {
            id: 'idle',
            owner: 'ci',
            status: 'active',
            consumers: [],
            names: ['TURBO_TOKEN'],
          },
        ],
        [
          {
            id: 'github:JovieInc/Jovie',
            observedAt: '2026-10-20T00:00:00Z',
            names: ['TURBO_TOKEN', 'MYSTERY_API_KEY', 'NEXT_PUBLIC_X_KEY'],
            referencedMissing: ['VERCEL_READONLY_TOKEN'],
          },
        ]
      ),
      null,
      '2026-10-20T01:00:00Z'
    );
    const byPrint = Object.fromEntries(
      findings.map(item => [item.fingerprint, item])
    );
    expect(byPrint['credential-hygiene:no-owner'].items).toEqual(['orphan']);
    expect(byPrint['credential-hygiene:no-consumer'].items).toEqual(['idle']);
    expect(byPrint['credential-hygiene:unowned-secret-names'].items).toEqual([
      'github:JovieInc/Jovie/MYSTERY_API_KEY',
    ]);
    expect(byPrint['credential-hygiene:referenced-missing'].items).toEqual([
      'github:JovieInc/Jovie/VERCEL_READONLY_TOKEN',
    ]);
    expect(counts.unclaimedSecretNames).toBe(1);
  });

  it('scopes a claim to its stores', () => {
    const claim = claimNames(
      credentials([
        {
          id: 'a',
          status: 'active',
          names: ['LINEAR_API_KEY'],
          stores: ['vercel'],
        },
      ])
    );
    expect(claim('vercel:jovie', 'LINEAR_API_KEY')).toBe('a');
    expect(claim('github:JovieInc/Jovie', 'LINEAR_API_KEY')).toBeNull();
  });

  it('rejects invalid registries loudly', () => {
    expect(
      validateCredentialsRegistry({ schema: 'x', credentials: [] })
    ).not.toEqual([]);
    expect(
      validateCredentialsRegistry(
        credentials([
          { id: 'a', status: 'active', names: ['('] },
          { id: 'a', status: 'bogus', expiresAt: 'soon' },
        ])
      )
    ).toHaveLength(4);
    expect(
      validateSpendLedger(spend([{ id: 'x', cap: { amountUsd: 0 } }]))
    ).toHaveLength(1);
    expect(() =>
      evaluate({ schema: 'nope' }, null, '2026-10-20T00:00:00Z')
    ).toThrow(/registry invalid/);
  });

  it('plans one remediation issue per alerting finding, skipping low', () => {
    const { findings } = evaluate(
      credentials([
        grant(),
        grant({ id: 'old', status: 'retired', retireAction: 'remove' }),
      ]),
      null,
      '2026-10-17T03:00:00Z'
    );
    const plans = planFindings(findings);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      fingerprint: 'credential-expiry:summer-gateway-recovery-grant:1d',
      priority: 1,
      createStateName: 'Todo',
    });
    expect(plans[0].title).toContain(
      '(credential-expiry:summer-gateway-recovery-grant:1d)'
    );
  });
});

describe('third-party grants', () => {
  it('reads GitHub last-used buckets', () => {
    expect(lastUsedMonths('never')).toBe(Infinity);
    expect(lastUsedMonths('2 weeks')).toBeLessThan(1);
    expect(lastUsedMonths('2 years')).toBe(24);
    expect(lastUsedMonths(null)).toBeNull();
  });

  it('lists stale, unused and unexplained grants for review, write access first', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    const [item] = evaluateThirdPartyGrants(
      [
        {
          platform: 'google',
          grantee: 'Boardy',
          purpose: 'booking',
          writeAccess: false,
        },
        {
          platform: 'google',
          grantee: 'Hark',
          purpose: null,
          writeAccess: true,
        },
        { platform: 'github-oauth', grantee: 'Warp', lastUsed: 'never' },
        { platform: 'github-oauth', grantee: 'GitHub CLI', lastUsed: '1 week' },
        {
          platform: 'github-org-app',
          grantee: 'sweep-ai-deprecated',
          purpose: null,
          writeAccess: true,
          updatedAt: '2025-12-11',
        },
      ],
      now
    );
    expect(item).toMatchObject({
      fingerprint: 'third-party-grant:review',
      severity: 'medium',
      owner: 'tim',
    });
    expect(item.items).toEqual([
      'google:Hark (no recorded purpose)',
      'github-org-app:sweep-ai-deprecated (no recorded purpose; grantee marked deprecated; write access, unchanged for 313 days)',
      'github-oauth:Warp (never used)',
    ]);
  });

  it('is quiet when every grant is used and explained', () => {
    expect(
      evaluateThirdPartyGrants(
        [{ platform: 'google', grantee: 'Boardy', purpose: 'booking' }],
        Date.now()
      )
    ).toEqual([]);
  });
});
