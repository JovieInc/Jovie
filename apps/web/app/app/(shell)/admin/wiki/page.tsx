import WikiIndexPage from '@/app/hud/wiki/page';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export default async function AdminWikiPage({
  searchParams,
}: Readonly<{
  readonly searchParams: Promise<{ q?: string }>;
}>) {
  await requireCurrentAdminPageAccess();
  return WikiIndexPage({ searchParams });
}
