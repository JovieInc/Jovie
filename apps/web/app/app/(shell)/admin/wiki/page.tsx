import WikiIndexPage from '@/app/hud/wiki/page';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminWikiIndexPage({
  searchParams,
}: Readonly<{
  readonly searchParams: Promise<{ q?: string }>;
}>) {
  await requireCurrentAdminPageAccess();

  return WikiIndexPage({ searchParams });
}
