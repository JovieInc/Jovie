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
  },
  generic: {
    title: 'Share your work with one link.',
    intro:
      'Example: a release. Your audience chooses where to listen. The action stays put while the service moves, and their choice follows the next song.',
  },
} as const;

export function getSmartLinksHeroCopy(genericCreatorNav: boolean): {
  readonly title: string;
  readonly intro: string;
} {
  return genericCreatorNav
    ? SMART_LINKS_HERO_COPY.generic
    : SMART_LINKS_HERO_COPY.current;
}
