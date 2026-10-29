/**
 * Connected-components copy: three connected release-page states.
 * Every state is a screenshot-registry capture of
 * the shipped page (lib/screenshots/registry.ts), never a drawn mockup.
 *
 * General-page copy (MKT-D16): no segment nouns. Platform names stay out of
 * strings because they are proper nouns the ICP guard cannot tell apart.
 * No price, plan, or trial term lives here; offers come from offer-truth.
 *
 * Not shown on purpose: a music-video page and a product (merch) smart link.
 * Neither has a registry capture, and merch is limited testing, so showing
 * either would overclaim.
 */
export const CONNECTED_COMPONENTS_COPY = {
  headline: 'Announce it. Release it. Keep it on your profile.',
  intro:
    'Your profile and release pages stay connected before and after release day.',
  galleryLabel: 'Release pages',
  states: [
    {
      id: 'coming-soon',
      scenarioId: 'tim-white-profile-presave-mobile',
      alt: 'A Jovie profile showing an upcoming release and a Get Updates button.',
      title: 'Upcoming release',
      body: 'Before release day, your profile says what is coming and lets people ask for updates.',
    },
    {
      id: 'out-now',
      scenarioId: 'release-presave-mobile',
      alt: 'A Jovie release page with a listen link for each streaming service.',
      title: 'Out now',
      body: 'One link sends every listener to the service they use.',
    },
    {
      id: 'profile',
      scenarioId: 'tim-white-profile-live-mobile',
      alt: 'A Jovie profile with the latest release first.',
      title: 'Your profile',
      body: 'The profile leads with your latest release and keeps the rest one tap away.',
    },
  ],
} as const;

export type ConnectedComponentsCopy = typeof CONNECTED_COMPONENTS_COPY;
