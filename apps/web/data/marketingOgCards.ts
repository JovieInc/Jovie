import { BASE_URL } from '@/constants/app';
import { linkInBioAlternative } from '@/content/alternatives/link-in-bio';
import { linktreeAlternative } from '@/content/alternatives/linktree';
import { linkfireComparison } from '@/content/comparisons/linkfire';
import { linktreeComparison } from '@/content/comparisons/linktree';
import { ABOUT_COPY } from '@/data/aboutCopy';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';

/**
 * Static marketing OG cards (JOV-7864).
 *
 * Titles are existing page headings or directory labels. The alternatives
 * index stays "Alternatives" so the general card does not repeat that page's
 * musician headline. Do not add a product-category alias or a retired tagline.
 */
export const MARKETING_OG_SIZE = { width: 1200, height: 630 } as const;

export interface MarketingOgCard {
  readonly id: string;
  readonly file: string;
  readonly title: string;
}

export const MARKETING_OG_CARDS = [
  {
    id: 'default',
    file: 'default.png',
    title: COMPANY_IDENTITY.homepageHeadline,
  },
  {
    id: 'about',
    file: 'about.png',
    title: ABOUT_COPY.headline,
  },
  {
    id: 'compare',
    file: 'compare.png',
    title: 'Compare Jovie',
  },
  {
    id: 'compare-linktree',
    file: 'compare-linktree.png',
    title: linktreeComparison.title,
  },
  {
    id: 'compare-linkfire',
    file: 'compare-linkfire.png',
    title: linkfireComparison.title,
  },
  {
    id: 'alternatives',
    file: 'alternatives.png',
    title: 'Alternatives',
  },
  {
    id: 'alternatives-linktree',
    file: 'alternatives-linktree.png',
    title: linktreeAlternative.title,
  },
  {
    id: 'alternatives-link-in-bio',
    file: 'alternatives-link-in-bio.png',
    title: linkInBioAlternative.title,
  },
  {
    id: 'cli',
    file: 'cli.png',
    title: 'Jovie, for your agents.',
  },
  {
    id: 'developers',
    file: 'developers.png',
    title: 'Public profile data, in the open.',
  },
  {
    id: 'api-versioning',
    file: 'api-versioning.png',
    title: 'API Versioning And Deprecation Policy',
  },
  {
    id: 'download',
    file: 'download.png',
    title: 'Jovie, Installed Where You Work.',
  },
  {
    id: 'support',
    file: 'support.png',
    title: "We're Here To Help.",
  },
] as const satisfies readonly MarketingOgCard[];

export type MarketingOgCardId = (typeof MARKETING_OG_CARDS)[number]['id'];

export function marketingOgCard(id: MarketingOgCardId): MarketingOgCard {
  const card = MARKETING_OG_CARDS.find(entry => entry.id === id);
  if (!card) throw new Error(`Unknown marketing OG card: ${id}`);
  return card;
}

const COMPARISON_OG_IDS = {
  linktree: 'compare-linktree',
  linkfire: 'compare-linkfire',
} as const satisfies Record<string, MarketingOgCardId>;

const ALTERNATIVE_OG_IDS = {
  linktree: 'alternatives-linktree',
  'link-in-bio': 'alternatives-link-in-bio',
} as const satisfies Record<string, MarketingOgCardId>;

export function comparisonOgImage(slug: string) {
  const id = COMPARISON_OG_IDS[slug as keyof typeof COMPARISON_OG_IDS];
  if (!id) throw new Error(`No comparison OG card for ${slug}`);
  return marketingOgImage(id);
}

export function alternativeOgImage(slug: string) {
  const id = ALTERNATIVE_OG_IDS[slug as keyof typeof ALTERNATIVE_OG_IDS];
  if (!id) throw new Error(`No alternative OG card for ${slug}`);
  return marketingOgImage(id);
}

export function marketingOgImage(id: MarketingOgCardId) {
  const card = marketingOgCard(id);
  return {
    url: `${BASE_URL}/og/${card.file}`,
    width: MARKETING_OG_SIZE.width,
    height: MARKETING_OG_SIZE.height,
    alt: card.title,
  } as const;
}
