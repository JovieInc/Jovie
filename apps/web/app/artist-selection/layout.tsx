import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';

export const dynamic = 'force-dynamic';

export default async function ArtistSelectionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ResolvedClientProviders>{children}</ResolvedClientProviders>;
}
