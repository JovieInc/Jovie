import type { FeatureIntroCatalog } from './feature-intro-contract';

export const FEATURE_INTRO_CATALOG: FeatureIntroCatalog = {
  highlight: {
    id: 'web-catalog-in-chat',
    title: 'Your Catalog Is Already In Chat',
    oneLine: 'Ask about a release, a show, or the next move.',
    ctaTitle: 'Ask Something',
  },
  whatsNewID: 'web-2026-08',
  whatsNewItems: [
    {
      id: 'plan-release',
      text: 'Ask Jovie to plan the next release.',
      accent: 'accent',
    },
    {
      id: 'one-shell',
      text: 'Library, calendar, and inbox stay together.',
      accent: 'blue',
    },
    {
      id: 'settings',
      text: 'Profile and billing stay in Settings.',
      accent: 'orange',
    },
    {
      id: 'signin-recover',
      text: 'Canceled sign-in is recoverable.',
      accent: 'accent',
    },
  ],
};
