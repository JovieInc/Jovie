import { Button } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { EmptyState } from '@/components/molecules/EmptyState';
import type { AdminPlaylistRow, AdminPlaylistTab } from './playlists-data';

type PlaylistAction = (formData: FormData) => void | Promise<void>;

interface AdminPlaylistsContentProps {
  readonly currentTab: AdminPlaylistTab;
  readonly playlists: AdminPlaylistRow[];
  readonly approveAction: PlaylistAction;
  readonly rejectAction: PlaylistAction;
}

function getEmptyPlaylistCopy(currentTab: AdminPlaylistTab) {
  return currentTab === 'pending'
    ? {
        heading: 'No Pending Playlists',
        description: 'Next one generates at 6:00 AM UTC.',
      }
    : {
        heading: `No ${currentTab === 'published' ? 'Published' : 'Rejected'} Playlists`,
        description: undefined,
      };
}

/** Canonical collection surface for the internal playlist review workflow. */
export function AdminPlaylistsContent({
  currentTab,
  playlists,
  approveAction,
  rejectAction,
}: Readonly<AdminPlaylistsContentProps>) {
  if (playlists.length === 0) {
    const emptyCopy = getEmptyPlaylistCopy(currentTab);
    return (
      <EmptyState
        heading={emptyCopy.heading}
        description={emptyCopy.description}
        presentation='workspace'
        className='min-h-80'
        testId='admin-playlists-empty-state'
      />
    );
  }

  return (
    <div className='space-y-3' data-testid='admin-playlists-content'>
      {playlists.map(playlist => (
        <ContentSurfaceCard key={playlist.id} className='overflow-hidden p-0'>
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

            {currentTab === 'pending' ? (
              <div className='flex shrink-0 gap-1.5'>
                <form action={approveAction}>
                  <input type='hidden' name='playlistId' value={playlist.id} />
                  <Button type='submit' size='sm' className='h-7'>
                    Approve
                  </Button>
                </form>
                <form action={rejectAction}>
                  <input type='hidden' name='playlistId' value={playlist.id} />
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
            ) : null}

            {currentTab === 'published' && playlist.spotifyPlaylistId ? (
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
                  <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
                  View on Spotify
                </a>
              </Button>
            ) : null}
          </div>
        </ContentSurfaceCard>
      ))}
    </div>
  );
}
