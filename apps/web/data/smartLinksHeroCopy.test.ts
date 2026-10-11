import { describe, expect, it } from 'vitest';
import { getSmartLinksHeroCopy } from './smartLinksHeroCopy';

describe('smart links hero copy', () => {
  it('keeps the music headline until the generic creator flag is on', () => {
    expect(getSmartLinksHeroCopy(false)).toEqual({
      title: 'One Link. Their Music App.',
      intro:
        'Let visitors choose where to listen. The action stays put while the service moves, and their choice follows the next song.',
      howTitle: 'Choose Your Sound. Once.',
      stepTitles: [
        'Land on the release',
        'Choose once',
        'Come back already set',
      ],
      ctaTitle: 'Make Every Link Sing.',
      ctaBody:
        'Give every release a home that takes visitors to their chosen music app.',
    });
  });

  it('frames a release as the worked example when generic creator nav is on', () => {
    const hero = getSmartLinksHeroCopy(true);
    expect(hero).toEqual({
      title: 'Share your work with one link.',
      intro:
        'Example: a release. Your audience chooses where to listen. The action stays put while the service moves, and their choice follows the next song.',
      howTitle: 'One link, three beats.',
      stepTitles: [
        'Land on the work',
        'Choose an app once',
        'Come back already set',
      ],
      ctaTitle: 'Create a smart link.',
      ctaBody:
        'Give everything you share a home that opens where your audience already is.',
    });
    expect(hero.title).not.toMatch(/\b(?:fans|visitors|followers)\b/iu);
    expect(hero.intro).not.toMatch(/\b(?:fans|visitors|followers)\b/iu);
  });
});
