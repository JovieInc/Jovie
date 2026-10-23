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
  headline: 'Each visit gets the right next step.',
  galleryLabel: 'Profile states',
  states: [
    {
      id: 'listen',
      scenarioId: 'tim-white-profile-listen-mobile',
      alt: "Tim White's Jovie profile showing his music catalog.",
      title: landingCard('straight-to-listen').title,
      body: landingCard('straight-to-listen').description,
    },
    {
      id: 'show-up',
      scenarioId: 'tim-white-profile-tour-mobile',
      alt: "Tim White's Jovie profile showing upcoming shows with ticket links.",
      title: landingCard('local-dates-first').title,
      body: landingCard('local-dates-first').description,
    },
    {
      id: 'stay-close',
      scenarioId: 'tim-white-profile-subscribe-mobile',
      alt: "Tim White's Jovie profile asking a fan to get updates by email.",
      title: landingCard('capture-the-fan').title,
      body: landingCard('capture-the-fan').description,
    },
  ],
} as const;
export type HomepageFanStatesCopy = typeof HOMEPAGE_FAN_STATES_COPY;
