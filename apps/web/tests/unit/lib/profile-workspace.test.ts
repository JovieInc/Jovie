import { describe, expect, it } from 'vitest';
import type { ProfileWorkspaceRow } from '@/app/app/(shell)/profiles/data';
import {
  filterProfileWorkspaceRows,
  formatProfileRankChange,
} from '@/lib/profile-surfaces/workspace';

const rows = [
  { id: 'jovie', rowType: 'surface', kind: 'jovie' },
  { id: 'spotify', rowType: 'surface', kind: 'dsp' },
  { id: 'instagram', rowType: 'surface', kind: 'social' },
  { id: 'website', rowType: 'surface', kind: 'website' },
  { id: 'wiki', rowType: 'surface', kind: 'authority' },
  { id: 'gmail', rowType: 'connector', kind: 'connector' },
] as unknown as ProfileWorkspaceRow[];

describe('profile workspace presentation', () => {
  it('filters by artist outcome groups', () => {
    expect(
      filterProfileWorkspaceRows(rows, 'catalog').map(row => row.id)
    ).toEqual(['wiki']);
    expect(
      filterProfileWorkspaceRows(rows, 'identity').map(row => row.id)
    ).toEqual(['jovie', 'website']);
  });

  it('filters every remaining category exactly', () => {
    expect(filterProfileWorkspaceRows(rows, 'profiles')).toHaveLength(2);
    expect(
      filterProfileWorkspaceRows(rows, 'profiles').map(row => row.id)
    ).toEqual(['spotify', 'instagram']);
    expect(filterProfileWorkspaceRows(rows, 'connector')).toHaveLength(1);
    expect(filterProfileWorkspaceRows(rows, 'all')).toHaveLength(rows.length);
  });

  it('formats rank movement from the artist perspective', () => {
    expect(formatProfileRankChange(2, 5)).toBe('+3');
    expect(formatProfileRankChange(8, 3)).toBe('-5');
    expect(formatProfileRankChange(4, 4)).toBe('—');
    expect(formatProfileRankChange(null, 4)).toBe('—');
  });
});
