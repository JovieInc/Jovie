import './app-utilities.css';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- next/script injects a nonce mismatch here during hydration */}
      <script src='/theme-init.js' />
      <ResolvedClientProviders>{children}</ResolvedClientProviders>
    </>
  );
}
