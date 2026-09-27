export interface AlternativeHighlight {
  title: string;
  description: string;
}

export interface AlternativeFaq {
  question: string;
  answer: string;
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
  whySwitch: string[];
  highlights: AlternativeHighlight[];
  faq: AlternativeFaq[];
}
