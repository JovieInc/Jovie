import type { Metadata } from 'next';
import {
  ABOUT_FAQ_ITEMS,
  AboutPageContent,
} from '@/components/organisms/AboutPageContent';
import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildOrganizationSchema,
} from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'About — The Release Platform for Independent Musicians',
  description:
    // ui-casing-allow: metadata sentence with brand names + acronym
    'Jovie is a release platform for independent musicians, combining smart links, artist profiles, audience intelligence, and AI. Founded by Tim White. Not affiliated with Jovie childcare.',
  keywords: [
    'Jovie',
    'Jovie music',
    'Jovie app',
    'what is Jovie',
    'Jovie Technology',
    'Tim White Jovie',
    'music release platform',
    'smart links for musicians',
    'link in bio for artists',
  ],
  alternates: {
    canonical: `${BASE_URL}/about`,
  },
  openGraph: {
    title: `About ${APP_NAME} — The Release Platform for Independent Musicians`,
    description:
      // ui-casing-allow: metadata sentence with brand names + acronym
      'Jovie is a release platform for independent musicians, combining smart links, artist profiles, audience intelligence, and AI. Founded by Tim White.',
    url: `${BASE_URL}/about`,
    type: 'website',
  },
};

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is the release platform for independent musicians, combining smart links, artist profiles, audience insights, paid release notifications, and AI support.',
  sameAs: ['https://instagram.com/meetjovie'],
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
