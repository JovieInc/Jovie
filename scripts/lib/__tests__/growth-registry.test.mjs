import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deadManAlerts,
  loadExperiments,
  loadLoops,
  loopFunnelReport,
  loopIdFromFirstTouch,
  trackedLink,
  validateExperiments,
  validateLoops,
} from '../growth-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const loops = loadLoops(repoRoot);
const experiments = loadExperiments(repoRoot);
const NOW = Date.parse('2026-10-26T12:00:00Z');
const hoursAgo = h => new Date(NOW - h * 3_600_000).toISOString();

const good = overrides => ({
  ...loops.entries.find(l => l.id === 'seo-gsc-pages'),
  ...overrides,
});
const withEntries = entries => ({ ...loops, entries });

describe('growth loop registry', () => {
  it('validates the committed registry and ledger', () => {
    expect(validateLoops(loops)).toEqual([]);
    expect(validateExperiments(experiments, loops)).toEqual([]);
  });

  it('registers the launch loops plus the positioning loop', () => {
    expect(loops.entries.map(l => l.id).sort()).toEqual([
      'artist-referral',
      'claim-link-outreach',
      'ig-scene-gating',
      'jovie-spotted-drafts',
      'positioning-hero',
      'seo-gsc-pages',
      'via-jovie-footer',
    ]);
  });

  it('rejects an outbound loop going live without Tim approval', () => {
    const errors = validateLoops(
      withEntries([
        good({ id: 'cold-dm', utmSource: 'cold_dm', outbound: true }),
      ])
    );
    expect(errors.join('\n')).toMatch(/need approval/);
  });

  it('accepts an approved outbound loop', () => {
    const errors = validateLoops(
      withEntries([
        good({
          id: 'cold-dm',
          utmSource: 'cold_dm',
          outbound: true,
          approval: { by: 'tim', at: '2026-10-26T00:00:00Z' },
        }),
      ])
    );
    expect(errors).toEqual([]);
  });

  it('rejects paid spend without approval, duplicate ids and duplicate sources', () => {
    const errors = validateLoops(
      withEntries([good({ spendCapUsd: 50 }), good({ spendCapUsd: 0 })])
    ).join('\n');
    expect(errors).toMatch(/need approval/);
    expect(errors).toMatch(/duplicate id/);
    expect(errors).toMatch(/already used/);
  });

  it('requires a registered loop and a decision on concluded experiments', () => {
    const bad = {
      ...experiments,
      entries: [
        {
          ...experiments.entries[0],
          loop: 'nope',
          status: 'concluded',
          startedAt: '2026-10-01',
        },
      ],
    };
    const errors = validateExperiments(bad, loops).join('\n');
    expect(errors).toMatch(/not in the loop registry/);
    expect(errors).toMatch(/endedAt/);
    expect(errors).toMatch(/kill\/scale\/iterate/);
  });
});

describe('attribution helpers', () => {
  const loop = loops.entries.find(l => l.id === 'via-jovie-footer');

  it('tracked link round-trips to the loop id through first-touch fields', () => {
    const url = new URL(
      trackedLink(loop, 'https://jov.ie/tim', { content: 'a' })
    );
    expect(url.searchParams.get('utm_campaign')).toBe(loop.id);
    expect(url.searchParams.get('utm_source')).toBe(loop.utmSource);
    const firstTouch = { campaign: url.searchParams.get('utm_campaign') };
    expect(loopIdFromFirstTouch(firstTouch, loops.entries)).toBe(loop.id);
  });

  it('unregistered or missing campaigns are unattributed', () => {
    expect(
      loopIdFromFirstTouch({ campaign: 'branding' }, loops.entries)
    ).toBeNull();
    expect(loopIdFromFirstTouch({}, loops.entries)).toBeNull();
  });
});

describe('dead-man', () => {
  const live = [good({ id: 'a', expectedEventWindowHours: 24 })];
  it('is green with a recent event', () => {
    expect(deadManAlerts(live, { a: hoursAgo(3) }, NOW)).toEqual([]);
  });
  it('alerts on silence and on never-seen', () => {
    expect(deadManAlerts(live, { a: hoursAgo(30) }, NOW)[0].silentHours).toBe(
      30
    );
    expect(deadManAlerts(live, {}, NOW)[0].reason).toMatch(/never/);
  });
  it('gives a brand-new loop one window of grace and ignores drafts', () => {
    const fresh = [
      good({ id: 'a', startedAt: hoursAgo(2), expectedEventWindowHours: 24 }),
    ];
    expect(deadManAlerts(fresh, {}, NOW)).toEqual([]);
    expect(
      deadManAlerts([good({ id: 'd', status: 'draft' })], {}, NOW)
    ).toEqual([]);
  });
});

describe('loop funnel report', () => {
  it('counts stages per loop and computes p50/p95 minutes', () => {
    const t = m =>
      new Date(Date.parse('2026-10-26T00:00:00Z') + m * 60_000).toISOString();
    const report = loopFunnelReport([
      {
        loop: 'x',
        at: { visit: t(0), 'waitlist-join': t(10), admitted: t(70) },
      },
      { loop: 'x', at: { visit: t(0), 'waitlist-join': t(30) } },
      { loop: null, at: { visit: t(0) } },
    ]);
    expect(report.x.counts.visit).toBe(2);
    expect(report.x.counts['waitlist-join']).toBe(2);
    expect(report.x.counts.admitted).toBe(1);
    expect(report.x.latency['waitlist-join']).toEqual({
      p50Min: 10,
      p95Min: 30,
      n: 2,
    });
    expect(report.x.latency.admitted.p50Min).toBe(60);
    expect(report.unattributed.counts.paid).toBe(0);
  });
});
