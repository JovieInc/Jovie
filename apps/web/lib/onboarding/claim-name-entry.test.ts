import { describe, expect, it } from 'vitest';
import { resolveClaimNameEntry } from './claim-name-entry';

describe('name entry and explicit address suggestions', () => {
  it.each([
    ['tim white', 'tim-white'],
    ['Beyoncé Knowles', 'beyonce-knowles'],
    ['Tim', 'tim'],
    ['tim', 'tim'],
    ['Nina O’Connor', 'nina-oconnor'],
  ])('preserves %s separately from its suggested handle', (name, handle) => {
    expect(resolveClaimNameEntry(name)).toEqual({
      displayName: name,
      handle,
      error: null,
    });
  });
  it('retains a non-Latin name without inventing an address or identity', () => {
    expect(resolveClaimNameEntry('宇多田 ヒカル')).toEqual({
      displayName: '宇多田 ヒカル',
      handle: '',
      error: null,
    });
  });
  it.each(['@TIM-WHITE', 'tim.white', 'tim_white', 'fixture-artist'])(
    'keeps the explicit handle %s out of name transliteration',
    raw => {
      expect(resolveClaimNameEntry(raw)).toEqual({
        displayName: null,
        handle: raw.replace(/^@/, '').toLowerCase(),
        error: null,
      });
    }
  );
  it.each([
    'https://jov.ie/tim',
    'jov.ie/tim',
    'https://example.com/Tim White',
    'a\u0000b',
  ])('does not turn %s into another handle', raw => {
    expect(resolveClaimNameEntry(raw)).toMatchObject({
      handle: '',
      displayName: null,
      error: expect.any(String),
    });
  });
});
