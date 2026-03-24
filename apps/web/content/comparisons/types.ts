export interface ComparisonFeature {
  name: string;
  jovie: boolean;
  competitor: boolean;
  note?: string;
}

export interface ComparisonFaq {
  question: string;
  answer: string;
}

export interface ComparisonData {
  slug: string;
  competitor: string;
  title: string;
  metaDescription: string;
  heroHeadline: string;
  heroSubheadline: string;
  features: ComparisonFeature[];
  faq: ComparisonFaq[];
  bottomLine: string;
}
