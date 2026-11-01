import type { Metadata } from 'next';
import { AgentConnectorDocs } from '@/components/features/developers/AgentConnectorDocs';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { marketingOgImage } from '@/data/marketingOgCards';
import snapshot from '@/lib/agent-distribution/generated/tools-list.snapshot.json';
import { LISTING } from '@/lib/agent-distribution/listing';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';
import { documentTitle } from '@/lib/seo/document-title';

const PAGE_URL = `${BASE_URL}${APP_ROUTES.DEVELOPERS_AGENTS}`;

export const metadata: Metadata = {
  title: documentTitle(`${LISTING.docsPage.title} - ${APP_NAME}`),
  description: LISTING.oneLiner,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: `${LISTING.docsPage.title} - ${APP_NAME}`,
    description: LISTING.oneLiner,
    url: PAGE_URL,
    type: 'article',
    images: [marketingOgImage('developers')],
  },
  twitter: {
    card: 'summary_large_image',
    images: [marketingOgImage('developers').url],
  },
};

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Developers', url: `${BASE_URL}${APP_ROUTES.DEVELOPERS}` },
  { name: LISTING.docsPage.title, url: PAGE_URL },
]);

export default function AgentConnectorDocsPage() {
  return (
    <>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <AgentConnectorDocs
        listing={LISTING}
        toolsListHash={snapshot.toolsListHash}
        tools={snapshot.tools}
      />
    </>
  );
}
