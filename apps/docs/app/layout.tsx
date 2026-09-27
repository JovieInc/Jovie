import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import 'nextra-theme-docs/style.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { HelpCenterSearch } from '@/components/HelpCenterSearch';
import {
  filterNavigationPageMap,
  loadArticleRegistry,
} from '@/lib/article-registry.mjs';
import { DOCS_ORIGIN } from '@/lib/help-center-seo.mjs';
import './help-search.css';

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_ORIGIN),
  title: {
    default: 'Jovie Help Center',
    template: '%s | Jovie Help Center',
  },
  description:
    'Clear answers for building your profile, sharing your work, and understanding your audience.',
  openGraph: {
    siteName: 'Jovie Help Center',
    type: 'website',
  },
  twitter: {
    card: 'summary',
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const articleRegistry = loadArticleRegistry();
  const primaryRoutes = articleRegistry.consumers.navigation.map(
    (article: { route: string }) => article.route
  );
  const pageMap = filterNavigationPageMap(await getPageMap(), primaryRoutes);

  return (
    <html lang='en' dir='ltr' suppressHydrationWarning>
      <Head
        backgroundColor={{
          dark: 'rgb(8, 9, 10)',
          light: 'rgb(250, 250, 250)',
        }}
        color={{
          hue: { dark: 260, light: 260 },
          saturation: { dark: 20, light: 50 },
        }}
      />
      <body>
        <Layout
          navbar={
            <Navbar
              logo={
                <span style={{ fontWeight: 700, fontSize: 18 }}>
                  Jovie Help Center
                </span>
              }
            >
              <HelpCenterSearch variant='mobile-only' />
            </Navbar>
          }
          pageMap={pageMap}
          docsRepositoryBase='https://github.com/ArtistFirst/Jovie/tree/main/apps/docs'
          editLink='Edit this page on GitHub'
          footer={
            <Footer>Copyright {new Date().getFullYear()} Jovie Inc.</Footer>
          }
          search={<HelpCenterSearch variant='desktop-only' />}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
