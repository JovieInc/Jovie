import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  type LookedSnapshot,
  parseSnapshot,
  summarizeSinceLastLooked,
} from './since-last-looked';

const base: LookedSnapshot = {
  at: Date.parse('2026-10-25T00:00:00Z'),
  mrrUsd: 0,
  subscribers: 0,
  signups7d: 1,
  merges7d: 300,
  fleet: 'healthy',
  askIds: ['a', 'b'],
};

describe('summarizeSinceLastLooked', () => {
  it('is empty when nothing moved', () => {
    expect(
      summarizeSinceLastLooked(base, { ...base, at: base.at + 3_600_000 })
    ).toEqual({ ageLabel: '1h ago', lines: [] });
  });

  it('names each change in one short line and caps at four', () => {
    const summary = summarizeSinceLastLooked(base, {
      ...base,
      at: base.at + 3 * 3_600_000,
      mrrUsd: 120,
      subscribers: 2,
      signups7d: 4,
      fleet: 'degraded',
      askIds: ['b', 'c', 'd'],
      merges7d: 340,
    });
    expect(summary.ageLabel).toBe('3h ago');
    expect(summary.lines).toEqual([
      'MRR $0 to $120',
      '+2 subscribers',
      '+3 signups (7d)',
      'Fleet healthy to degraded',
    ]);
  });

  it('counts new and cleared decisions by id, not by total', () => {
    const summary = summarizeSinceLastLooked(base, {
      ...base,
      askIds: ['b', 'c'],
    });
    expect(summary.lines).toEqual(['1 new decision', '1 decision cleared']);
  });

  it('skips any number that was not measured on either side', () => {
    expect(
      summarizeSinceLastLooked(
        { ...base, mrrUsd: null },
        { ...base, mrrUsd: 50, at: base.at + 1 }
      ).lines
    ).toEqual([]);
  });
});

describe('snapshot storage', () => {
  it('formats ages', () => {
    expect(ageLabel(30_000)).toBe('1m ago');
    expect(ageLabel(90 * 60_000)).toBe('2h ago');
    expect(ageLabel(72 * 3_600_000)).toBe('3d ago');
  });

  it('rejects corrupt storage instead of throwing', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('{not json')).toBeNull();
    expect(parseSnapshot('{"at":"x"}')).toBeNull();
    expect(parseSnapshot(JSON.stringify(base))).toEqual(base);
  });
});
