export interface AlternativeHighlight {
  title: string;
  description: string;
}

export interface AlternativeFaq {
  question: string;
  answer: string;
}

export interface AlternativeData {
  slug: string;
  category: string;
  title: string;
  metaDescription: string;
  heroHeadline: string;
  heroSubheadline: string;
  whySwitch: string[];
  highlights: AlternativeHighlight[];
  faq: AlternativeFaq[];
}
