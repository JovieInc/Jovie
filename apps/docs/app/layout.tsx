import { Head, Search } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import 'nextra-theme-docs/style.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: 'Jovie Docs',
    template: '%s | Jovie Docs',
  },
  description:
    'Documentation for Jovie - the platform for musicians to manage their career.',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
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
                  Jovie Docs
                </span>
              }
            />
          }
          pageMap={await getPageMap()}
          docsRepositoryBase='https://github.com/ArtistFirst/Jovie/tree/main/apps/docs'
          editLink='Edit this page on GitHub'
          footer={
            <Footer>Copyright {new Date().getFullYear()} Jovie Inc.</Footer>
          }
          search={<Search />}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
