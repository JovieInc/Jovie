import { describe, expect, it } from 'vitest';
import {
  buildClaimProfileArtistSearchStarterPrompt,
  buildHomepageClaimEntryHref,
  isHomepageDisplayNamePrior,
  normalizeHomepageHandleCandidate,
} from './homepageClaimEntry';

describe('normalizeHomepageHandleCandidate', () => {
  it.each([
    ['lunaharbor', 'lunaharbor'],
    [' @LunaHarbor ', 'lunaharbor'],
    ['Taylor.Swift', 'taylor.swift'],
    ['ab', null],
    ['Taylor Swift', null],
    ['Beyoncé', null],
    ['', null],
  ])('normalizes %j to %j', (raw, expected) => {
    expect(normalizeHomepageHandleCandidate(raw)).toBe(expected);
  });
});

describe('isHomepageDisplayNamePrior', () => {
  it('treats spaced and non-handle names as search priors', () => {
    expect(isHomepageDisplayNamePrior('Taylor Swift')).toBe(true);
    expect(isHomepageDisplayNamePrior("Billie Eilish O'Connell")).toBe(true);
    expect(isHomepageDisplayNamePrior('Beyoncé')).toBe(true);
  });

  it('does not treat valid handles or tiny fragments as display names', () => {
    expect(isHomepageDisplayNamePrior('lunaharbor')).toBe(false);
    expect(isHomepageDisplayNamePrior('ab')).toBe(false);
    expect(isHomepageDisplayNamePrior('')).toBe(false);
  });
});

describe('buildHomepageClaimEntryHref', () => {
  it('emits handle= only for valid handles', () => {
    const href = buildHomepageClaimEntryHref(' @LunaHarbor ');
    const url = new URL(href, 'https://jov.ie');
    expect(url.pathname).toBe('/start');
    expect(url.searchParams.get('handle')).toBe('lunaharbor');
    expect(url.searchParams.get('starter_prompt')).toBe(
      'I want to claim jov.ie/lunaharbor.'
    );
  });

  it('never poisons handle= with a display name; routes to Spotify search', () => {
    const href = buildHomepageClaimEntryHref('Taylor Swift');
    const url = new URL(href, 'https://jov.ie');
    expect(url.pathname).toBe('/start');
    expect(url.searchParams.get('handle')).toBeNull();
    expect(url.searchParams.get('starter_prompt')).toBe(
      buildClaimProfileArtistSearchStarterPrompt('Taylor Swift')
    );
  });

  it('keeps an empty field on the generic claim starter', () => {
    const href = buildHomepageClaimEntryHref('  ');
    const url = new URL(href, 'https://jov.ie');
    expect(url.searchParams.get('handle')).toBeNull();
    expect(url.searchParams.get('starter_prompt')).toBe(
      'I want to claim my profile.'
    );
  });
});
