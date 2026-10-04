import type { PublishedClaimId } from '../published-claims';

export interface AlternativeHighlight {
  title: string;
  description: string;
  claimIds: readonly PublishedClaimId[];
}

export interface AlternativeFaq {
  question: string;
  answer: string;
  claimIds: readonly PublishedClaimId[];
}

export interface AlternativeReason {
  text: string;
  claimIds: readonly PublishedClaimId[];
}

export interface AlternativeHeroImage {
  /** Public path under /images/hero/*, unique per route (no repeats). */
  src: string;
  alt: string;
}

export interface AlternativeData {
  slug: string;
  category: string;
  title: string;
  metaDescription: string;
  heroHeadline: string;
  heroSubheadline: string;
  /** Low-opacity dark-underlay hero background; never a person photo. */
  heroImage: AlternativeHeroImage;
  whySwitch: AlternativeReason[];
  highlights: AlternativeHighlight[];
  faq: AlternativeFaq[];
  /** Claims covering page-level metadata and hero copy. */
  claimIds: readonly PublishedClaimId[];
}
