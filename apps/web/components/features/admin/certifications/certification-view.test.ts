import { describe, expect, it } from 'vitest';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import {
  CERTIFICATION_STALE_AFTER_MS,
  countRowsByState,
  filterCertificationRows,
  isInventoryStale,
  passedTierCount,
  shortSha,
} from './certification-view';

const rows = fixtureInventory().rows;

describe('certification view helpers', () => {
  it('filters by state, domain, and text query', () => {
    expect(
      filterCertificationRows(rows, { state: 'all', domain: 'all' })
    ).toHaveLength(3);
    expect(
      filterCertificationRows(rows, {
        state: 'review_ready',
        domain: 'all',
      }).map(row => row.id)
    ).toEqual(['flows:signup-golden-path']);
    expect(
      filterCertificationRows(rows, {
        state: 'all',
        domain: 'public_profiles',
      }).map(row => row.id)
    ).toEqual(['public_profiles:public-profile']);
    expect(
      filterCertificationRows(rows, {
        state: 'all',
        domain: 'all',
        query: '  CLAIM ',
      }).map(row => row.id)
    ).toEqual(['flows:claim-profile']);
  });

  it('combines owner, revision freshness, and blocker filters across domains', () => {
    const owned = rows.map((row, index) => ({
      ...row,
      owner: index === 0 ? 'Summer' : null,
    }));
    expect(
      filterCertificationRows(owned, {
        state: 'all',
        domain: 'all',
        owner: 'Summer',
        freshness: 'current',
        blockers: 'clear',
      }).map(row => row.id)
    ).toEqual(['flows:signup-golden-path']);
    expect(
      filterCertificationRows(owned, {
        state: 'all',
        domain: 'all',
        owner: 'unassigned',
        blockers: 'blocked',
      }).map(row => row.id)
    ).toEqual(['flows:claim-profile']);
    expect(
      filterCertificationRows(
        [
          { ...owned[0]!, staleFounderLock: true },
          { ...owned[1]!, source: null },
        ],
        { state: 'all', domain: 'all', freshness: 'stale' }
      )
    ).toHaveLength(1);
    expect(
      filterCertificationRows([{ ...owned[0]!, source: null }], {
        state: 'all',
        domain: 'all',
        freshness: 'missing',
      })
    ).toHaveLength(1);
  });

  it('counts rows per state with an all bucket', () => {
    expect(countRowsByState(rows)).toEqual({
      all: 3,
      working: 1,
      review_ready: 1,
      founder_locked: 1,
      shipped: 0,
      monitored: 0,
    });
  });

  it('marks inventories stale only past the freshness window', () => {
    const now = Date.parse('2026-09-27T08:00:00.000Z');
    expect(isInventoryStale(undefined, now)).toBe(false);
    expect(isInventoryStale('2026-09-27T08:00:00.000Z', now)).toBe(false);
    expect(
      isInventoryStale(
        new Date(now - CERTIFICATION_STALE_AFTER_MS - 1).toISOString(),
        now
      )
    ).toBe(true);
    expect(isInventoryStale('garbage', now)).toBe(false);
  });

  it('counts passed tiers and shortens SHAs', () => {
    expect(passedTierCount(rows[0]!)).toBe(6);
    expect(shortSha('abcdef0123456789')).toBe('abcdef0');
  });
});
