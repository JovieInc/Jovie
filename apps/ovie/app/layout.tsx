import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import '@/app/globals.css';
import '@/styles/system-b-app.css';
import './workspace.css';

const inter = localFont({
  src: '../../web/public/fonts/Inter-Latin.woff2',
  variable: '--font-inter',
  display: 'optional',
  weight: '100 900',
});
export const metadata: Metadata = {
  title: { default: 'Ovie', template: '%s | Ovie' },
  description: 'Private company operations.',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en' className={inter.variable} suppressHydrationWarning>
      <body>
        <ResolvedClientProviders>{children}</ResolvedClientProviders>
      </body>
    </html>
  );
}
