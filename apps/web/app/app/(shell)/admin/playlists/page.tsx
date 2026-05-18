import { Button } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { approvePlaylist, rejectPlaylist } from './playlist-actions';
import { type AdminPlaylistTab, loadAdminPlaylists } from './playlists-data';

export const metadata: Metadata = { title: 'Playlists — Admin' };
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
  const { tab = 'pending' } = await searchParams;
  const currentTab = (
    ['pending', 'published', 'rejected'].includes(tab) ? tab : 'pending'
  ) as AdminPlaylistTab;
  const playlists = await loadAdminPlaylists(currentTab);

  return (
    <AdminWorkspacePage
      title='Playlists'
      description='Review and approve auto-generated playlists.'
      primaryParam='tab'
      primaryValue={currentTab}
      primaryOptions={TAB_OPTIONS}
      testId='admin-playlists'
    >
      {/* Playlist list */}
      {playlists.length === 0 ? (
        <div className='py-16 text-center text-app text-tertiary-token'>
          {tab === 'pending'
            ? 'No pending playlists. Next one generates at 6:00 AM UTC.'
            : `No ${tab} playlists.`}
        </div>
      ) : (
        <div className='space-y-3'>
          {playlists.map(playlist => (
            <ContentSurfaceCard
              key={playlist.id}
              className='overflow-hidden p-0'
            >
              <div className='flex flex-col gap-3 px-(--linear-app-header-padding-x) py-3 sm:flex-row sm:items-start sm:justify-between'>
                <div className='min-w-0'>
                  <h3 className='truncate text-app font-caption text-primary-token'>
                    {playlist.title}
                  </h3>
                  <p className='mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-tertiary-token'>
                    {playlist.trackCount} tracks
                    {playlist.genreTags?.length
                      ? ` \u2022 ${playlist.genreTags.join(', ')}`
                      : ''}
                    {' \u2022 '}
                    {new Date(playlist.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {tab === 'pending' && (
                  <div className='flex shrink-0 gap-1.5'>
                    <form action={approvePlaylist}>
                      <input
                        type='hidden'
                        name='playlistId'
                        value={playlist.id}
                      />
                      <Button type='submit' size='sm' className='h-7'>
                        Approve
                      </Button>
                    </form>
                    <form action={rejectPlaylist}>
                      <input
                        type='hidden'
                        name='playlistId'
                        value={playlist.id}
                      />
                      <Button
                        type='submit'
                        variant='ghost'
                        size='sm'
                        className='h-7'
                      >
                        Reject
                      </Button>
                    </form>
                  </div>
                )}

                {tab === 'published' && playlist.spotifyPlaylistId && (
                  <Button
                    asChild
                    variant='ghost'
                    size='sm'
                    className='h-7 shrink-0'
                  >
                    <a
                      href={`https://open.spotify.com/playlist/${playlist.spotifyPlaylistId}`}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      <ExternalLink
                        className='h-3.5 w-3.5'
                        aria-hidden='true'
                      />
                      View on Spotify
                    </a>
                  </Button>
                )}
              </div>
            </ContentSurfaceCard>
          ))}
        </div>
      )}
    </AdminWorkspacePage>
  );
}
