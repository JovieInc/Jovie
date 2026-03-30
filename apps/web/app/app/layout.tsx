import './app-utilities.css';
import Script from 'next/script';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Script src='/theme-init.js' strategy='beforeInteractive' />
      <ResolvedClientProviders>{children}</ResolvedClientProviders>
    </>
  );
}
