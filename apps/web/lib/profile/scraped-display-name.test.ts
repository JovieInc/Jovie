import { describe, expect, it } from 'vitest';
import {
  cleanScrapedDisplayName,
  hasScrapedTitleChrome,
} from './scraped-display-name';

describe('cleanScrapedDisplayName', () => {
  it.each([
    ['Mega Ran | Instagram, Facebook, Twitch', 'Mega Ran'],
    ['Tom River | Official Music, Tour Dates & Tickets', 'Tom River'],
    ['ninadevitry - Listen on YouTube, Spotify', 'ninadevitry'],
    ['@bktherula', 'bktherula'],
    ['Simple Things - Listen on Spotify', 'Simple Things'],
    ['ODESZA Tour Dates, Tickets & Merch Links', 'ODESZA'],
    ['AndyG | DJ & Producer | Instagram, Facebook, TikTok', 'AndyG'],
  ])('strips page-title chrome from %s', (raw, expected) => {
    expect(cleanScrapedDisplayName(raw)).toBe(expected);
  });

  it('keeps real names that merely contain a hyphen or pipe-less words', () => {
    expect(cleanScrapedDisplayName('Jay-Z')).toBe('Jay-Z');
    expect(cleanScrapedDisplayName('Florence + the Machine')).toBe(
      'Florence + the Machine'
    );
  });

  it('returns null when the title is only a role, so callers use the handle', () => {
    expect(
      cleanScrapedDisplayName('Hip Hop Artist | NC - Listen on…')
    ).toBeNull();
    expect(cleanScrapedDisplayName('Singer-Songwriter')).toBeNull();
    expect(cleanScrapedDisplayName('DJ Mitsu the Beats')).toBe(
      'DJ Mitsu the Beats'
    );
  });

  it('returns null for empty input', () => {
    expect(cleanScrapedDisplayName('')).toBeNull();
    expect(cleanScrapedDisplayName(null)).toBeNull();
    expect(cleanScrapedDisplayName('@')).toBeNull();
  });
});

describe('hasScrapedTitleChrome', () => {
  it('detects page-title chrome', () => {
    expect(
      hasScrapedTitleChrome('Mega Ran | Instagram, Facebook, Twitch')
    ).toBe(true);
    expect(
      hasScrapedTitleChrome('ninadevitry - Listen on YouTube, Spotify')
    ).toBe(true);
    expect(
      hasScrapedTitleChrome('ODESZA Tour Dates, Tickets & Merch Links')
    ).toBe(true);
  });

  it('does not flag real names or empty input', () => {
    expect(hasScrapedTitleChrome('A-ha')).toBe(false);
    expect(hasScrapedTitleChrome('Jay-Z')).toBe(false);
    expect(hasScrapedTitleChrome('DJ Shadow')).toBe(false);
    expect(hasScrapedTitleChrome('')).toBe(false);
    expect(hasScrapedTitleChrome(null)).toBe(false);
  });
});
