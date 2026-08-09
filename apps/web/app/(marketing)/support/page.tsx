import type { Metadata } from 'next';
import {
  SUPPORT_FAQ_ITEMS,
  SupportPageContent,
} from '@/components/organisms/SupportPageContent';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get help with Jovie. Browse documentation, find answers to common questions, or contact our support team.',
  keywords: [
    'Jovie support',
    'Jovie help',
    'Jovie documentation',
    'music smart links help',
    'artist profile support',
    'Jovie contact',
  ],
  alternates: {
    canonical: `${BASE_URL}/support`,
  },
  openGraph: {
    title: `Support - ${APP_NAME}`,
    description:
      'Get help with Jovie. Browse documentation, find answers to common questions, or contact our support team.',
    url: `${BASE_URL}/support`,
    type: 'website',
  },
};

export const revalidate = false;

const FAQ_SCHEMA = buildFaqSchema([...SUPPORT_FAQ_ITEMS]);
const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Support', url: `${BASE_URL}/support` },
]);

export default function SupportPage() {
  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <SupportPageContent />
    </>
  );
}
