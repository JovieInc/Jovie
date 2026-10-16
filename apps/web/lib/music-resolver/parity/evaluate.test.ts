import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  buildCatalog,
  materializeCatalog,
  REQUIRED_LOCAL_PASS_IDS,
} from './catalog';
import { CHARTMETRIC_ENDPOINT_COUNT } from './chartmetric-endpoints';
import { finishEvaluation, runParityEvaluation } from './evaluate';
import { MUSICFETCH_DOCUMENTED_SERVICES } from './permissions';
import { runParityProbes } from './probes';
import { rowIsPass } from './score';
import { SOCIALBLADE_ROWS } from './socialblade-rows';
import { catalogHash, matchesTarget, PARITY_TARGET_SHA256 } from './target';
import type { ParityRow } from './types';

describe('music resolver parity eval', () => {
  it('keeps unfinished assertion storage red without a fabricated lease', async () => {
    const report = await runParityEvaluation();
    expect(report.denominator).toBe(
      8 + 12 + CHARTMETRIC_ENDPOINT_COUNT + SOCIALBLADE_ROWS.length
    );
    expect(report.passing).toBe(REQUIRED_LOCAL_PASS_IDS.length);
    expect(report.unblockedFailures.map(row => row.id)).toEqual([
      'jovie:canonical-assertions',
    ]);
    expect(report.exitCode).toBe(1);
    expect(report.blocked.length).toBe(
      report.denominator - REQUIRED_LOCAL_PASS_IDS.length - 1
    );

    const coverage = report.rows.find(
      row => row.id === 'musicfetch:service-coverage'
    );
    expect(coverage?.capability).toContain('spotify');
    expect(coverage?.capability).toContain('youtube');
    expect(coverage && rowIsPass(coverage)).toBe(false);

    const score = report.rows.find(row => row.capability.includes('/cm-score'));
    expect(score?.status).toBe('vendor-only-opaque-metric');
    expect(score && rowIsPass(score)).toBe(false);

    const production = report.rows.find(
      row => row.id === 'jovie:production-certification'
    );
    expect(production?.status).toBe('access-blocked');
    expect(production && rowIsPass(production)).toBe(false);

    const leased = report.rows.find(
      row => row.id === 'jovie:same-name-without-mbid'
    );
    expect(leased?.status).toBe('missing');
    expect(leased?.blocker?.lease?.issue).toBe('JOV-7818');
    expect(leased && rowIsPass(leased)).toBe(false);

    expect(MUSICFETCH_DOCUMENTED_SERVICES).toContain('spotify');
    expect(MUSICFETCH_DOCUMENTED_SERVICES).toContain('youtube');
    expect(
      report.rows.filter(row => row.vendor === 'chartmetric')
    ).toHaveLength(CHARTMETRIC_ENDPOINT_COUNT);
  });

  it('does not pass when a required probe is skipped', async () => {
    const probes = await runParityProbes();
    const skipped = probes.map(probe =>
      probe.id === 'isrc-lookup'
        ? { ...probe, outcome: 'skipped' as const, ref: '' }
        : probe
    );
    const report = await finishEvaluation(
      materializeCatalog(buildCatalog(), skipped)
    );
    expect(report.exitCode).toBe(1);
    expect(report.passing).toBe(REQUIRED_LOCAL_PASS_IDS.length - 1);
    expect(
      report.unblockedFailures.some(row => row.id === 'musicfetch:isrc')
    ).toBe(true);
  });

  it('does not pass when an extra row is marked locally tested', async () => {
    const probes = await runParityProbes();
    const extra: ParityRow = {
      id: 'jovie:invented',
      vendor: 'jovie',
      capability: 'Invented pass',
      docUrl: 'https://example.com',
      status: 'locally-tested',
      evidence: { kind: 'local-test', ref: 'not-a-required-probe' },
    };
    const report = finishEvaluation([
      ...materializeCatalog(buildCatalog(), probes),
      extra,
    ]);
    expect(rowIsPass(extra)).toBe(true);
    expect(report.exitCode).toBe(1);
  });
});

describe('frozen catalog denominator', () => {
  it('turns red when an access-blocked family is omitted', async () => {
    const probes = await runParityProbes();
    const rows = materializeCatalog(buildCatalog(), probes).filter(
      row => row.id !== 'musicfetch:live-api'
    );
    const report = finishEvaluation(rows);
    expect(report.exitCode).toBe(1);
    expect(report.denominator).toBe(buildCatalog().length);
    expect(report.targetError).toContain('frozen target');
  });

  it('turns red when a documented target is silently changed', async () => {
    const probes = await runParityProbes();
    const rows = materializeCatalog(buildCatalog(), probes).map(row =>
      row.id === 'musicfetch:isrc'
        ? { ...row, capability: 'Different target' }
        : row
    );
    expect(finishEvaluation(rows).exitCode).toBe(1);
  });
});

describe('versioned target', () => {
  it.each(['missing', 'changed'] as const)(
    'rejects %s documented contract metadata',
    async mutation => {
      const target = buildCatalog();
      const rows = materializeCatalog(target, await runParityProbes()).map(
        row =>
          row.contract
            ? {
                ...row,
                contract:
                  mutation === 'missing'
                    ? undefined
                    : { ...row.contract, queryParameters: ['invented'] },
              }
            : row
      );
      expect(matchesTarget(rows, target)).toBe(false);
      expect(finishEvaluation(rows).exitCode).toBe(1);
    }
  );

  it('freezes the existing catalog and rejects documentation drift', async () => {
    const target = buildCatalog();
    expect(catalogHash(target)).toBe(PARITY_TARGET_SHA256);
    expect(catalogHash([...target].reverse())).toBe(PARITY_TARGET_SHA256);
    const rows = materializeCatalog(target, await runParityProbes());
    expect(matchesTarget(rows, target)).toBe(true);
    const changed = target.map((entry, i) =>
      i === 0 ? { ...entry, docUrl: 'https://example.com/drift' } : entry
    );
    expect(matchesTarget(rows, changed)).toBe(false);
  });
});

it('retains newly documented Chartmetric refresh operations as blocked', async () => {
  const report = await runParityEvaluation();
  for (const path of [
    '/api/artist/{id}/tiktok/refresh',
    '/api/playlist/{platform}/{id}/refresh',
  ]) {
    const row = report.rows.find(row => row.id === `chartmetric:POST ${path}`);
    expect(row?.status).toBe('access-blocked');
    expect(row?.blocker?.owner).toBeTruthy();
    expect(row && rowIsPass(row)).toBe(false);
  }
});
