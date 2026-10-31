import { describe, expect, it } from 'vitest';
import {
  creditSet,
  matchArtistCredits,
  sameCatalogName,
  sameUpc,
} from './catalog-names';

describe('collaborator credits', () => {
  it.each([
    ['Coldplay & BTS', ['coldplay', 'bts']],
    ['A feat. B', ['a', 'b']],
    ['A ft. B', ['a', 'b']],
    ['A x B', ['a', 'b']],
    ['A with B', ['a', 'b']],
    ['A, B', ['a', 'b']],
    ['Song Artist (feat. B)', ['song artist', 'b']],
  ])('splits %s', (value, expected) => {
    expect([...creditSet(value)].sort()).toEqual([...expected].sort());
  });

  it('does not split inside a name', () => {
    expect([...creditSet('Rex Orange County')]).toEqual(['rex orange county']);
    expect([...creditSet('Max')]).toEqual(['max']);
  });

  it('matches exact, reordered and array credits as exact', () => {
    expect(matchArtistCredits('Tim White', 'Tim White')).toBe('exact');
    expect(matchArtistCredits('Coldplay & BTS', 'BTS x Coldplay')).toBe(
      'exact'
    );
    expect(
      matchArtistCredits('BTS & Coldplay', 'Coldplay, BTS', ['Coldplay', 'BTS'])
    ).toBe('exact');
    expect(matchArtistCredits('Tim White', 'x', ['Tim White'])).toBe('exact');
  });

  it('marks a lead artist inside a larger credit as credit-only', () => {
    expect(matchArtistCredits('BTS', 'Coldplay & BTS')).toBe('credit');
    expect(matchArtistCredits('BTS', 'x', ['Coldplay', 'BTS'])).toBe('credit');
    expect(matchArtistCredits('David Guetta', 'David Guetta feat. Sia')).toBe(
      'credit'
    );
  });

  it('rejects other artists and partial overlaps', () => {
    expect(matchArtistCredits('BTS', 'Coldplay')).toBeNull();
    expect(matchArtistCredits('A & C', 'A & B')).toBeNull();
    expect(matchArtistCredits('', 'A')).toBeNull();
    expect(sameCatalogName('', '')).toBe(false);
  });

  it('compares UPCs across 12, 13 and 14 digit spellings', () => {
    expect(sameUpc('00602567247746', '602567247746')).toBe(true);
    expect(sameUpc('0602567247746', '602567247747')).toBe(false);
    expect(sameUpc(null, '1')).toBe(false);
    expect(sameUpc('0000', '0')).toBe(false);
  });
});
