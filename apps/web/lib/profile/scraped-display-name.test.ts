import { describe, expect, it } from 'vitest';
import { cleanScrapedDisplayName } from './scraped-display-name';

describe('cleanScrapedDisplayName', () => {
  it.each([
    ['Mega Ran | Instagram, Facebook, Twitch', 'Mega Ran'],
    ['Tom River | Official Music, Tour Dates & Tickets', 'Tom River'],
    ['ninadevitry - Listen on YouTube, Spotify', 'ninadevitry'],
    ['@bktherula', 'bktherula'],
    ['Simple Things - Listen on Spotify', 'Simple Things'],
  ])('strips page-title chrome from %s', (raw, expected) => {
    expect(cleanScrapedDisplayName(raw)).toBe(expected);
  });

  it('keeps real names that merely contain a hyphen or pipe-less words', () => {
    expect(cleanScrapedDisplayName('Jay-Z')).toBe('Jay-Z');
    expect(cleanScrapedDisplayName('Florence + the Machine')).toBe(
      'Florence + the Machine'
    );
  });

  it('returns null for empty input', () => {
    expect(cleanScrapedDisplayName('')).toBeNull();
    expect(cleanScrapedDisplayName(null)).toBeNull();
    expect(cleanScrapedDisplayName('@')).toBeNull();
  });
});
