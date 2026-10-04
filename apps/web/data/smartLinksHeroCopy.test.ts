import { describe, expect, it } from 'vitest';
import { getSmartLinksHeroCopy } from './smartLinksHeroCopy';

describe('smart links hero copy', () => {
  it('keeps the music headline until the generic creator flag is on', () => {
    expect(getSmartLinksHeroCopy(false)).toEqual({
      title: 'One Link. Their Music App.',
      intro:
        'Let visitors choose where to listen. The action stays put while the service moves, and their choice follows the next song.',
    });
  });

  it('frames a release as the worked example when generic creator nav is on', () => {
    const hero = getSmartLinksHeroCopy(true);
    expect(hero).toEqual({
      title: 'Share your work with one link.',
      intro:
        'Example: a release. Your audience chooses where to listen. The action stays put while the service moves, and their choice follows the next song.',
    });
    expect(hero.title).not.toMatch(/\b(?:fans|visitors|followers)\b/iu);
    expect(hero.intro).not.toMatch(/\b(?:fans|visitors|followers)\b/iu);
  });
});
