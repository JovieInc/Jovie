import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import 'nextra-theme-docs/style.css';
import './globals.css';
import './help.css';
import './help-search.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { ArticleFeedback } from '@/components/ArticleFeedback';
import { ContactSupportLink } from '@/components/ContactSupportLink';
import { HelpCenterAnalytics } from '@/components/HelpCenterAnalytics';
import { HelpShell } from '@/components/help/HelpShell';
import {
  filterNavigationPageMap,
  loadArticleRegistry,
} from '@/lib/article-registry.mjs';
import { DOCS_ORIGIN } from '@/lib/help-center-seo.mjs';
import { buildHelpNav } from '@/lib/help-nav.mjs';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

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
  const nav = buildHelpNav(pageMap);

  return (
    <html
      lang='en'
      dir='ltr'
      className={inter.variable}
      suppressHydrationWarning
    >
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
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <HelpShell nav={nav}>
            {children}
            <ArticleFeedback />
            <footer className='help-footer'>
              Copyright {new Date().getFullYear()} Jovie Inc.{' '}
              <ContactSupportLink />
            </footer>
          </HelpShell>
          <HelpCenterAnalytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
