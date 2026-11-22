import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SharedViewPage } from '@/components/features/views/SharedViewPage';
import { getOptionalAuth } from '@/lib/auth/cached';
import { getSharedView } from '@/lib/views/service.server';

interface SharedViewRouteProps {
  readonly params: Promise<{ token: string }>;
}

export async function generateMetadata({
  params,
}: SharedViewRouteProps): Promise<Metadata> {
  const { token } = await params;
  const view = await getSharedView(token);
  return {
    title: view ? `${view.title} · Jovie` : 'View not found · Jovie',
    robots: { index: false, follow: false },
  };
}

export default async function SharedViewRoute({
  params,
}: SharedViewRouteProps) {
  const { token } = await params;
  const view = await getSharedView(token);
  if (!view) notFound();
  const { userId } = await getOptionalAuth();
  return (
    <SharedViewPage
      view={view}
      token={token}
      signedIn={Boolean(userId)}
      viewerOwnsView={Boolean(userId) && userId === view.ownerUserId}
    />
  );
}
