import WikiPageView from '@/app/hud/wiki/[...slug]/page';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export default async function AdminWikiArticlePage({
  params,
}: Readonly<{
  readonly params: Promise<{ slug: string[] }>;
}>) {
  await requireCurrentAdminPageAccess();
  return WikiPageView({ params });
}
