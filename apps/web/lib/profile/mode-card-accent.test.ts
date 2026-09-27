import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ARTWORK_ACCENT,
  PROFILE_MODE_CARD_ORDER,
  type ProfileCardAccentInput,
  resolveProfileCardAccents,
  resolveProfileModeCardAccents,
} from './mode-card-accent';

function accentsFor(cards: readonly ProfileCardAccentInput[]) {
  return resolveProfileCardAccents(cards).map(item => item.accent);
}

describe('resolveProfileCardAccents', () => {
  it('rotates ion, ultra, pulse in visual order before orange enters', () => {
    expect(accentsFor([{}, {}, {}, {}])).toEqual([
      'ion',
      'ultra',
      'pulse',
      'orange',
    ]);
  });

  it('never gives adjacent cards the same accent, even on long surfaces', () => {
    const accents = accentsFor(Array.from({ length: 12 }, () => ({})));
    for (let index = 1; index < accents.length; index += 1) {
      expect(accents[index]).not.toBe(accents[index - 1]);
    }
  });

  it('keeps cycling all four accents once every accent has been used', () => {
    expect(accentsFor([{}, {}, {}, {}, {}, {}])).toEqual([
      'ion',
      'ultra',
      'pulse',
      'orange',
      'ion',
      'ultra',
    ]);
  });

  it('lets an image anchor pick its accent and continues the rotation from it', () => {
    expect(
      accentsFor([{ imageAnchor: 'ultra', hasImage: true }, {}, {}])
    ).toEqual(['ultra', 'pulse', 'ion']);
  });

  it('holds orange back until ion, ultra, and pulse are all used', () => {
    expect(accentsFor([{ imageAnchor: 'pulse' }, {}, {}, {}])).toEqual([
      'pulse',
      'ion',
      'ultra',
      'orange',
    ]);
  });

  it('ignores an image anchor that would repeat the previous card', () => {
    const accents = accentsFor([{}, { imageAnchor: 'ion', hasImage: true }]);
    expect(accents).toEqual(['ion', 'ultra']);
  });

  it('desaturates cards that carry art and keeps chroma on text cards', () => {
    expect(
      resolveProfileCardAccents([
        { hasImage: true },
        {},
        { imageAnchor: 'orange' },
      ]).map(item => item.strength)
    ).toEqual(['art', 'text', 'art']);
  });

  it('is deterministic for the same input', () => {
    const cards = [{ imageAnchor: 'ultra' as const }, {}, {}, {}];
    expect(resolveProfileCardAccents(cards)).toEqual(
      resolveProfileCardAccents(cards)
    );
  });
});

describe('resolveProfileModeCardAccents', () => {
  it('matches the Pen mode cards when the Listen card shows artwork', () => {
    const accents = resolveProfileModeCardAccents({
      listenArtworkAccent: DEFAULT_ARTWORK_ACCENT,
    });

    expect(accents.listen).toEqual({ accent: 'ultra', strength: 'art' });
    expect(accents.events).toEqual({ accent: 'pulse', strength: 'text' });
    expect(accents.payments).toEqual({ accent: 'ion', strength: 'text' });
    expect(accents['stay-close']).toEqual({
      accent: 'orange',
      strength: 'text',
    });
  });

  it('falls back to positional rotation when the Listen card has no artwork', () => {
    const accents = resolveProfileModeCardAccents();

    expect(PROFILE_MODE_CARD_ORDER.map(kind => accents[kind].accent)).toEqual([
      'ion',
      'ultra',
      'pulse',
      'orange',
    ]);
    expect(accents.listen.strength).toBe('text');
  });

  it('never repeats an accent between neighbouring mode cards', () => {
    for (const anchor of ['ion', 'ultra', 'pulse', 'orange'] as const) {
      const accents = resolveProfileModeCardAccents({
        listenArtworkAccent: anchor,
      });
      const ordered = PROFILE_MODE_CARD_ORDER.map(kind => accents[kind].accent);
      for (let index = 1; index < ordered.length; index += 1) {
        expect(ordered[index]).not.toBe(ordered[index - 1]);
      }
    }
  });
});
