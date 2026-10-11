import { APP_NAME } from '@/constants/app';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { definePage } from '@/data/marketing/factory/pageRecord';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

/**
 * /solutions/artists (JOV-5861), migrated to a page record in JOV-7275 with
 * zero visual diff. Section copy still reads ARTIST_PROFILE_COPY, the one
 * artist copy source shared with /artist-profiles.
 */
export const solutionsArtistsPage = definePage({
  id: 'solutions.artists',
  family: 'solutions',
  slug: 'artists',
  status: 'indexed',
  brief: {
    audience: 'independent artists',
    job: 'show artists how profiles connect music, links, and permissioned fan updates',
    successEvent: 'artist claims a profile',
    copyScope: 'music',
  },
  claims: [
    'capability.artist-profiles.public-artist-profile',
    'capability.artist-profiles.audience-capture',
    'capability.artist-profiles.fan-reactivation',
  ],
  composition: {
    recipeId: 'artist-lp',
    penContractId: MARKETING_PEN_CONTRACT_IDS.recipe.artistLp,
    shellClassName: 'artist-profiles-home-system',
    sections: [
      { renderer: 'artist-hero-adaptive-intro', sectionId: 'hero' },
      { renderer: 'artist-outcomes', sectionId: 'feature-grid' },
      { renderer: 'artist-capture', sectionId: 'capture' },
      { renderer: 'artist-opinionated', sectionId: 'feature-split' },
      { renderer: 'artist-annotated-truth', sectionId: 'feature-split' },
      { renderer: 'shipped-sites-showcase', sectionId: 'product-gallery' },
      { renderer: 'platform-spec-bento', sectionId: 'spec-wall' },
      { renderer: 'artist-how-it-works', sectionId: 'how-it-works' },
      { renderer: 'artist-release-cycle', sectionId: 'product-gallery' },
      { renderer: 'artist-faq', sectionId: 'faq' },
      { renderer: 'artist-final-cta', sectionId: 'cta' },
    ],
  },
  heroVariant: 'split-link-claim',
  proof: ['product-profile-subscribe-capture'],
  seo: {
    title: 'Music links and fan updates for artists',
    socialTitle: `For Artists | ${APP_NAME}`,
    description:
      'Bring your music, tour dates, and fan signups together on Jovie. Give listeners one artist link for releases, shows, and updates they choose to receive.',
    keywords: [...ARTIST_PROFILE_COPY.seo.keywords],
    schema: ['SoftwareApplication'],
    siblings: [],
    hub: null,
    ogImage: '/og/default.png',
  },
  trust: null,
  updatedAt: '2026-10-01',
});
