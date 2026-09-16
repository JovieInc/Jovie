import type { Metadata } from 'next';
import { AboutPageContent } from '@/components/organisms/AboutPageContent';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { ABOUT_COPY, ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';
import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildOrganizationSchema,
} from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: ABOUT_COPY.metadataTitle,
  description: ABOUT_COPY.metadataDescription,
  keywords: [...ABOUT_COPY.keywords],
  alternates: {
    canonical: `${BASE_URL}/about`,
  },
  openGraph: {
    title: `About ${APP_NAME} — ${ABOUT_COPY.headline.replace(/\.$/, '')}`,
    description: ABOUT_COPY.openGraphDescription,
    url: `${BASE_URL}/about`,
    type: 'website',
  },
};

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: LEGAL_ENTITY_NAME,
  description: ABOUT_COPY.organizationDescription,
});

const FAQ_SCHEMA = buildFaqSchema([...ABOUT_FAQ_ITEMS]);

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'About', url: `${BASE_URL}/about` },
]);

export default function AboutPage() {
  return (
    <>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <AboutPageContent />
    </>
  );
}
