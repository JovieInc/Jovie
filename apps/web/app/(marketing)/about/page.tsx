import type { Metadata } from 'next';
import { AboutPageContent } from '@/components/organisms/AboutPageContent';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { SUPPORT_EMAIL } from '@/constants/domains';
import { ABOUT_COPY, ABOUT_FACTS, ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';
import { marketingOgImage } from '@/data/marketingOgCards';
import {
  buildAboutPageSchema,
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildFounderSchema,
  buildOrganizationSchema,
  SCHEMA_IDS,
} from '@/lib/constants/schemas';
import { documentTitle } from '@/lib/seo/document-title';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export const revalidate = false;

export const metadata: Metadata = {
  title: documentTitle(ABOUT_COPY.metadataTitle),
  description: ABOUT_COPY.metadataDescription,
  keywords: [...ABOUT_COPY.keywords],
  alternates: {
    canonical: `${BASE_URL}/about`,
  },
  openGraph: {
    title: ABOUT_COPY.metadataTitle,
    description: ABOUT_COPY.openGraphDescription,
    url: `${BASE_URL}/about`,
    type: 'website',
    images: [marketingOgImage('about')],
  },
  twitter: {
    card: 'summary_large_image',
    images: [marketingOgImage('about').url],
  },
};

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: LEGAL_ENTITY_NAME,
  description: ABOUT_COPY.organizationDescription,
  sameAs: [...ABOUT_FACTS.organizationSameAs],
  founderId: SCHEMA_IDS.founder,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SUPPORT_EMAIL,
    url: `${BASE_URL}${ABOUT_FACTS.supportPath}`,
  },
});

const PERSON_SCHEMA = buildFounderSchema({
  name: ABOUT_FACTS.founder,
  url: TIM_WHITE_PROFILE.publicProfileUrl,
  sameAs: [...ABOUT_FACTS.founderSameAs],
});

const ABOUT_PAGE_SCHEMA = buildAboutPageSchema({
  name: `About ${APP_NAME}`,
  description: ABOUT_COPY.metadataDescription,
  url: `${BASE_URL}/about`,
});

const FAQ_SCHEMA = buildFaqSchema([...ABOUT_FAQ_ITEMS]);

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'About', url: `${BASE_URL}/about` },
]);

export default function AboutPage() {
  return (
    <>
      <script type='application/ld+json'>{ABOUT_PAGE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>
      <script type='application/ld+json'>{PERSON_SCHEMA}</script>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <AboutPageContent />
    </>
  );
}
