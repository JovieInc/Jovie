import { describe, expect, it } from 'vitest';
import { runCheck } from '../../credentials-spend-check.mjs';
import { readLanesLinearStatus } from '../credentials-live-reads.mjs';
import { DAY_MS } from '../credentials-registry.mjs';

const at = iso => Date.parse(iso);
const credentials = entries => ({
  schema: 'jovie.credentials-registry/v1',
  credentials: entries,
  stores: [],
});
const spend = () => ({ schema: 'jovie.spend-ledger/v1', providers: [] });
const grant = overrides => ({ status: 'active', ...overrides });

describe('Lanes token expiry metadata (JOV-12193)', () => {
  const now = at('2026-11-10T17:00:00Z');
  const id = 'lanes-linear-app-oauth';
  const snapshot = (overrides = {}) =>
    JSON.stringify({
      schema: 'jovie.linear-app-status/v1',
      observedAt: new Date(now).toISOString(),
      available: true,
      scopeMatches: true,
      expiresInS: 29 * 86400,
      mintFailed: false,
      ...overrides,
    });
  const registry = {
    credentials: credentials([
      grant({
        id,
        provider: 'linear',
        owner: 'gem-lanes',
        expiresAt: null,
        consumers: ['lanes', 'symphony'],
        names: ['LINEAR_CLIENT_(ID|SECRET)'],
      }),
    ]),
    spend: spend(),
  };
  const check = raw =>
    runCheck({
      env: { LANES_LINEAR_APP_STATUS: raw },
      live: true,
      registry,
      codexPath: '/nonexistent',
      now: () => now,
    });

  it('replaces the stale registry date with a fresh redacted host observation', async () => {
    const report = await runCheck({
      env: {
        LANES_LINEAR_APP_STATUS: snapshot({ accessToken: 'must-not-escape' }),
      },
      live: true,
      codexPath: '/nonexistent',
      now: () => now,
      registry: {
        ...registry,
        credentials: credentials([
          {
            ...registry.credentials.credentials[0],
            expiresAt: '2026-11-10T22:40:59Z',
          },
        ]),
      },
    });
    expect(report.findings.filter(item => item.subject === id)).toEqual([]);
    expect(report.run.reads.lanesLinearApp).toBe('ok');
    expect(JSON.stringify(report)).not.toContain('must-not-escape');
    expect(readLanesLinearStatus(snapshot(), now)).toEqual({
      ok: true,
      value: { id, expiresAt: new Date(now + 29 * DAY_MS).toISOString() },
    });
  });

  it.each([
    [6 * 86400, '7d'],
    [3600, '1d'],
    [-1, 'expired'],
  ])(
    'still alerts for a live token with %s seconds left',
    async (expiresInS, threshold) => {
      const report = await check(snapshot({ expiresInS }));
      expect(report.findings).toContainEqual(
        expect.objectContaining({
          fingerprint: `credential-expiry:${id}:${threshold}`,
        })
      );
    }
  );

  it.each([
    ['null', 'metadata-unavailable'],
    ['{', 'metadata-unparsed'],
    [snapshot({ schema: 'wrong' }), 'metadata-unavailable'],
    [snapshot({ available: false }), 'app-unavailable'],
    [snapshot({ scopeMatches: false }), 'scope-mismatch'],
    [snapshot({ mintFailed: true }), 'mint-failed'],
    [snapshot({ mintFailed: null }), 'metadata-unavailable'],
    [snapshot({ expiresInS: null }), 'expiry-unparsed'],
    [snapshot({ expiresInS: '2592000' }), 'expiry-unparsed'],
    [
      snapshot({ observedAt: new Date(now - 301000).toISOString() }),
      'metadata-stale',
    ],
    [
      snapshot({ observedAt: new Date(now + 1000).toISOString() }),
      'metadata-stale',
    ],
  ])('fails visibly and without raw metadata for %s', async (raw, reason) => {
    const report = await check(raw);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        fingerprint: `credential-observation:${id}:unavailable`,
        severity: 'high',
      })
    );
    expect(report.run.reads.lanesLinearApp).toBe(reason);
    expect(report.run.counts.findings).toBe(report.findings.length);
    expect(report.run.counts.bySeverity.high).toBe(1);
    expect(report.plans).toContainEqual(
      expect.objectContaining({
        fingerprint: `credential-observation:${id}:unavailable`,
        priority: 2,
      })
    );
  });

  it('labels off-host coverage honestly without inventing an expiry', async () => {
    const report = await runCheck({
      env: {},
      live: true,
      registry,
      codexPath: '/nonexistent',
      now: () => now,
    });
    expect(report.run.reads.lanesLinearApp).toBe(
      'not-observed:owned-by-gem-lanes'
    );
    expect(report.findings.filter(item => item.subject === id)).toEqual([]);
  });
});
