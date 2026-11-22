import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ViewShell } from '@/components/features/views/ViewShell';
import { getOptionalAuth } from '@/lib/auth/cached';
import { getSharedView } from '@/lib/views/service.server';

interface SharedViewPageProps {
  readonly params: Promise<{ token: string }>;
}

export async function generateMetadata({
  params,
}: SharedViewPageProps): Promise<Metadata> {
  const { token } = await params;
  const view = await getSharedView(token);
  return {
    title: view ? `${view.title} · Jovie` : 'View not found · Jovie',
    robots: { index: false, follow: false },
  };
}

export default async function SharedViewPage({ params }: SharedViewPageProps) {
  const { token } = await params;
  const view = await getSharedView(token);
  if (!view) notFound();
  const { userId } = await getOptionalAuth();
  return (
    <ViewShell
      view={view}
      token={token}
      signedIn={Boolean(userId)}
      viewerOwnsView={Boolean(userId) && userId === view.ownerUserId}
    />
  );
}
