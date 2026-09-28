import HudPage, { metadata } from '@/app/hud/page';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export { metadata };

// Next.js route-segment config must be a local literal. Re-exporting
// `dynamic`/`runtime` fails Turbopack: "mustn't be reexported".
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminHudPage({
  searchParams,
}: Readonly<{
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await requireCurrentAdminPageAccess();
  // The packaged Mac compatibility query resolves to this same shell route.
  const { ovie: _macDoor, ...params } = await searchParams;
  return HudPage({ searchParams: Promise.resolve(params) });
}
