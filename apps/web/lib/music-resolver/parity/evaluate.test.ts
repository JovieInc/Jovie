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
import type { ParityRow } from './types';

describe('music resolver parity eval', () => {
  it('scores the shipped catalog without passing blocked or leased rows', async () => {
    const report = await runParityEvaluation();
    expect(report.denominator).toBe(
      8 + 12 + CHARTMETRIC_ENDPOINT_COUNT + SOCIALBLADE_ROWS.length
    );
    expect(report.passing).toBe(REQUIRED_LOCAL_PASS_IDS.length);
    expect(report.unblockedFailures).toEqual([]);
    expect(report.exitCode).toBe(0);
    expect(report.blocked.length).toBe(
      report.denominator - REQUIRED_LOCAL_PASS_IDS.length
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
