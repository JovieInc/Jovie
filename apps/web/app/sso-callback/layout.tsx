import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';

export const dynamic = 'force-dynamic';

export default async function SsoCallbackLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ResolvedClientProviders>{children}</ResolvedClientProviders>;
}
