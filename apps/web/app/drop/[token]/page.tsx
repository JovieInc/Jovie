import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LibraryShareDropSurface } from '@/components/features/library-share/LibraryShareDropSurface';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { hasLibraryShareDropAccess } from '@/lib/library-share/access';
import { buildLibraryShareDropPublicView } from '@/lib/library-share/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DropPageProps {
  readonly params: Promise<{ token: string }>;
}

export async function generateMetadata({
  params,
}: DropPageProps): Promise<Metadata> {
  const { token } = await params;
  const view = await buildLibraryShareDropPublicView(token);

  if (!view) {
    return {
      title: 'Drop not found · Jovie',
      robots: { index: false, follow: false },
    };
  }

  const title = `${view.title} · ${view.artistName} · Jovie`;

  return {
    title,
    description:
      view.message ??
      `Curated release assets from ${view.artistName}, shared via Jovie.`,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description:
        view.message ??
        `Curated release assets from ${view.artistName}, shared via Jovie.`,
      type: 'website',
      siteName: 'Jovie',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description:
        view.message ??
        `Curated release assets from ${view.artistName}, shared via Jovie.`,
    },
  };
}

export default async function LibraryShareDropPage({ params }: DropPageProps) {
  const { token } = await params;
  const view = await buildLibraryShareDropPublicView(token);

  if (!view) {
    notFound();
  }

  const initialUnlocked = view.requiresPassphrase
    ? await hasLibraryShareDropAccess(token)
    : true;

  return (
    <PublicPageShell
      headerVariant='landing'
      logoSize='xs'
      mainClassName='bg-(--linear-bg-page)'
    >
      <LibraryShareDropSurface view={view} initialUnlocked={initialUnlocked} />
    </PublicPageShell>
  );
}
