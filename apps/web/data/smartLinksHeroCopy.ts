/**
 * /smart-links hero (JOV-7579).
 *
 * Flag off keeps the current music headline. Flag on frames the link for any
 * creator and keeps a release as the worked example. Smart links are certified
 * for music only; this copy does not claim other work types are live.
 */
export const SMART_LINKS_HERO_COPY = {
  current: {
    title: 'One Link. Their Music App.',
    intro:
      'Let visitors choose where to listen. The action stays put while the service moves, and their choice follows the next song.',
    howTitle: 'Choose Your Sound. Once.',
    stepTitles: ['Land on the release', 'Choose once', 'Come back already set'],
    ctaTitle: 'Make Every Link Sing.',
    ctaBody:
      'Give every release a home that takes visitors to their chosen music app.',
  },
  generic: {
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
  },
} as const;

export function getSmartLinksHeroCopy(genericCreatorNav: boolean): {
  readonly title: string;
  readonly intro: string;
  readonly howTitle: string;
  readonly stepTitles: readonly [string, string, string];
  readonly ctaTitle: string;
  readonly ctaBody: string;
} {
  return genericCreatorNav
    ? SMART_LINKS_HERO_COPY.generic
    : SMART_LINKS_HERO_COPY.current;
}
