import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ResolvedClientProviders>{children}</ResolvedClientProviders>;
}
