import type { PublishedClaimId } from '../published-claims';

export interface ComparisonFeature {
  name: string;
  jovie: boolean;
  competitor: boolean;
  note?: string;
  claimIds: readonly PublishedClaimId[];
}

export interface ComparisonFaq {
  question: string;
  answer: string;
  claimIds: readonly PublishedClaimId[];
}

export interface ComparisonHeroImage {
  /** Public path under /images/hero/*, unique per route (no repeats). */
  src: string;
  alt: string;
}

export interface ComparisonData {
  slug: string;
  competitor: string;
  title: string;
  metaDescription: string;
  heroHeadline: string;
  heroSubheadline: string;
  /** Low-opacity dark-underlay hero background; never a person photo. */
  heroImage: ComparisonHeroImage;
  features: ComparisonFeature[];
  faq: ComparisonFaq[];
  bottomLine: string;
  /** Claims covering page-level metadata, hero copy, and the bottom line. */
  claimIds: readonly PublishedClaimId[];
}
