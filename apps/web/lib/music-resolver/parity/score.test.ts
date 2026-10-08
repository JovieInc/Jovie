import { describe, expect, it } from 'vitest';
import { rowIsPass, scoreRows } from './score';
import type { Blocker, ParityRow } from './types';

const lease: Blocker = {
  failure: 'Leased identity file',
  owner: 'JOV-7818',
  reviewTrigger: 'PR #20549 merges',
  lease: {
    issue: 'JOV-7818',
    prs: [20549],
    files: ['apps/web/lib/music-resolver/in-house.ts'],
  },
};

function row(overrides: Partial<ParityRow> & Pick<ParityRow, 'id'>): ParityRow {
  return {
    vendor: 'jovie',
    capability: overrides.id,
    docUrl: 'https://example.com/docs',
    status: 'documented',
    ...overrides,
  };
}

describe('parity score', () => {
  it('passes only a local test or a deployed ref', () => {
    expect(
      rowIsPass(
        row({
          id: 'local',
          status: 'locally-tested',
          evidence: { kind: 'local-test', ref: 'resolveInHouse:isrc-lookup' },
        })
      )
    ).toBe(true);
    expect(
      rowIsPass(
        row({
          id: 'deployed',
          status: 'deployed-verified',
          evidence: { kind: 'deployed', ref: 'abc123' },
        })
      )
    ).toBe(true);
  });

  it('rejects untested, skipped, empty, unsupported, and blocked evidence', () => {
    for (const kind of [
      'untested',
      'skipped',
      'empty',
      'unsupported',
      'inaccessible',
      'rights-blocked',
    ] as const) {
      expect(
        rowIsPass(
          row({
            id: kind,
            status: 'locally-tested',
            evidence: { kind, ref: 'fixture' },
          })
        )
      ).toBe(false);
    }
    expect(
      rowIsPass(
        row({
          id: 'blank',
          status: 'locally-tested',
          evidence: { kind: 'local-test', ref: '   ' },
        })
      )
    ).toBe(false);
    expect(
      rowIsPass(
        row({
          id: 'documented',
          status: 'documented',
          evidence: { kind: 'local-test', ref: 'fixture' },
        })
      )
    ).toBe(false);
  });

  it('keeps blocked rows in the denominator and out of the passing count', () => {
    const blocked = row({
      id: 'blocked',
      status: 'access-blocked',
      blocker: {
        failure: 'No token',
        owner: 'vendor',
        reviewTrigger: 'A credentialed local test exists',
      },
      evidence: { kind: 'local-test', ref: 'should-not-pass' },
    });
    const report = scoreRows([blocked]);
    expect(report.denominator).toBe(1);
    expect(report.passing).toBe(0);
    expect(report.blocked.map(item => item.id)).toEqual(['blocked']);
    expect(report.exitCode).toBe(0);
    expect(rowIsPass(blocked)).toBe(false);
  });

  it('fails closed when a residual blocker is incomplete', () => {
    const report = scoreRows([
      row({
        id: 'incomplete',
        status: 'rights-blocked',
        blocker: { failure: 'terms', owner: '', reviewTrigger: 'later' },
      }),
    ]);
    expect(report.exitCode).toBe(1);
    expect(report.unblockedFailures.map(item => item.id)).toEqual([
      'incomplete',
    ]);
  });

  it('accepts a missing row only when the lease is complete', () => {
    const leased = scoreRows([
      row({ id: 'leased', status: 'missing', blocker: lease }),
    ]);
    expect(leased.exitCode).toBe(0);
    expect(leased.passing).toBe(0);
    expect(leased.blocked).toHaveLength(1);

    const naked = scoreRows([
      row({
        id: 'naked',
        status: 'missing',
        blocker: {
          failure: 'not built',
          owner: 'us',
          reviewTrigger: 'soon',
        },
      }),
    ]);
    expect(naked.exitCode).toBe(1);
    expect(naked.unblockedFailures.map(item => item.id)).toEqual(['naked']);
  });

  it('fails an empty catalog instead of treating omission as green', () => {
    const report = scoreRows([]);
    expect(report.denominator).toBe(0);
    expect(report.passing).toBe(0);
    expect(report.exitCode).toBe(1);
  });
});
