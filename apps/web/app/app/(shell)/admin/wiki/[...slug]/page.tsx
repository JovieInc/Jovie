import WikiPageView from '@/app/hud/wiki/[...slug]/page';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminWikiPageView({
  params,
}: Readonly<{
  readonly params: Promise<{ slug: string[] }>;
}>) {
  await requireCurrentAdminPageAccess();

  return WikiPageView({ params });
}
