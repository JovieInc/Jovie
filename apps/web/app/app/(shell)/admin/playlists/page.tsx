import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getSidebarRouteLabel } from '@/lib/constants/sidebar-route-labels';
import { AdminPlaylistsContent } from './AdminPlaylistsContent';
import { approvePlaylist, rejectPlaylist } from './playlist-actions';
import { type AdminPlaylistTab, loadAdminPlaylists } from './playlists-data';

export const metadata: Metadata = {
  title: getSidebarRouteLabel(APP_ROUTES.ADMIN_PLAYLISTS, 'ov'),
};
export const runtime = 'nodejs';

const TAB_OPTIONS = [
  { value: 'pending' as const, label: 'Pending' },
  { value: 'published' as const, label: 'Published' },
  { value: 'rejected' as const, label: 'Rejected' },
] as const;

export default async function AdminPlaylistsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ tab?: string }>;
}>) {
  await requireCurrentAdminPageAccess();

  const { tab = 'pending' } = await searchParams;
  const currentTab = (
    ['pending', 'published', 'rejected'].includes(tab) ? tab : 'pending'
  ) as AdminPlaylistTab;
  const playlists = await loadAdminPlaylists(currentTab);

  return (
    <AdminPage
      title='Playlists'
      description='Review and approve auto-generated playlists.'
      tabs={{
        param: 'tab',
        value: currentTab,
        options: TAB_OPTIONS,
      }}
      testId='admin-playlists'
    >
      <AdminPlaylistsContent
        currentTab={currentTab}
        playlists={playlists}
        approveAction={approvePlaylist}
        rejectAction={rejectPlaylist}
      />
    </AdminPage>
  );
}
