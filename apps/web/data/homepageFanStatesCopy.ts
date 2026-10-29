import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

/**
 * Homepage product-gallery copy: one real profile state per phone. Titles and
 * fan outcomes reuse `ARTIST_PROFILE_COPY.outcomes.landingCards` so the
 * homepage and /artist-profiles cannot drift apart. Captures come from the
 * screenshot registry (lib/screenshots/registry.ts).
 */

const LANDING_CARDS = ARTIST_PROFILE_COPY.outcomes.landingCards;

function landingCard(id: (typeof LANDING_CARDS)[number]['id']) {
  const card = LANDING_CARDS.find(item => item.id === id);
  if (!card) throw new Error(`Unknown artist profile landing card: ${id}`);
  return card;
}

export const HOMEPAGE_FAN_STATES_COPY = {
  headline: 'Your profile leads with one clear thing.',
  galleryLabel: 'Profile states',
  states: [
    {
      id: 'listen',
      title: landingCard('straight-to-listen').title,
      body: landingCard('straight-to-listen').description,
    },
    {
      id: 'show-up',
      title: landingCard('local-dates-first').title,
      body: landingCard('local-dates-first').description,
    },
    {
      id: 'stay-close',
      title: landingCard('capture-the-fan').title,
      body: landingCard('capture-the-fan').description,
    },
  ],
} as const;
/** Headline and label widen so a published page spec can fill them. */
export type HomepageFanStatesCopy = Omit<
  typeof HOMEPAGE_FAN_STATES_COPY,
  'headline' | 'galleryLabel'
> & {
  readonly headline: string;
  readonly galleryLabel: string;
};
