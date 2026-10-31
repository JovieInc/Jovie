import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { OptimizedImage } from '@/components/molecules/OptimizedImage';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

export interface ArtistsDirectoryProfile {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
}

export interface ArtistsDirectoryProps {
  readonly profiles: readonly ArtistsDirectoryProfile[];
  /** Accepted for callers; the page no longer prints a count. */
  readonly total?: number | null;
  /** Opaque cursor for the next page; null on the last page. */
  readonly nextCursor?: string | null;
  /** Whether this is the first page of the directory. */
  readonly isFirstPage?: boolean;
}

const BROKEN_UNSPLASH_PLACEHOLDER =
  /^https:\/\/images\.unsplash\.com\/placeholder(?:[/?#]|$)/i;

export function getArtistsDirectoryAvatarUrl(
  avatarUrl: string | null
): string | null {
  const normalized = avatarUrl?.trim() ?? '';
  if (!normalized || BROKEN_UNSPLASH_PLACEHOLDER.test(normalized)) return null;
  return normalized;
}

export function ArtistsDirectory({
  profiles,
  nextCursor = null,
  isFirstPage = true,
}: Readonly<ArtistsDirectoryProps>) {
  return (
    <StandaloneProductPage width='xl'>
      <div className='space-y-6' data-testid='artists-directory'>
        <ContentSectionHeader
          density='compact'
          headingLevel='h1'
          title='Artists'
        />

        {profiles.length > 0 ? (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {profiles.map(profile => (
              <ContentSurfaceCard key={profile.id} surface='nested'>
                <Link
                  href={'/' + profile.username}
                  className='group flex h-full flex-col items-center gap-3 p-5 text-center transition-colors'
                >
                  <div className='h-24 w-24'>
                    <OptimizedImage
                      src={getArtistsDirectoryAvatarUrl(profile.avatarUrl)}
                      alt={
                        (profile.displayName || profile.username) +
                        ' creator profile'
                      }
                      size='xl'
                      shape='circle'
                      className='mx-auto'
                      aspectRatio='square'
                      sizes='(max-width: 640px) 96px, (max-width: 1024px) 96px, 96px'
                    />
                  </div>

                  <div className='space-y-1'>
                    <h2 className='text-mid font-semibold text-primary-token transition-colors group-hover:text-secondary-token'>
                      {profile.displayName || profile.username}
                    </h2>
                    {/* The real bio, or nothing. Never a filler line. */}
                    {profile.bio ? (
                      <p className='line-clamp-3 text-app leading-5 text-secondary-token'>
                        {profile.bio}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </ContentSurfaceCard>
            ))}
          </div>
        ) : (
          <p className='text-app text-secondary-token'>No profiles yet.</p>
        )}

        {nextCursor || !isFirstPage ? (
          <nav
            aria-label='Artists Directory Pages'
            className='flex items-center justify-center gap-3'
          >
            {!isFirstPage ? (
              <Link
                href='/artists'
                className='text-app font-semibold text-secondary-token transition-colors hover:text-primary-token'
              >
                First page
              </Link>
            ) : null}
            {nextCursor ? (
              <Link
                href={`/artists?cursor=${encodeURIComponent(nextCursor)}`}
                className='inline-flex items-center gap-1 rounded-full border border-subtle px-4 py-2 text-app font-semibold text-primary-token transition-colors hover:bg-surface-2'
                data-testid='artists-directory-next-page'
              >
                Load more artists
                <Icon name='ChevronRight' className='h-4 w-4' />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </StandaloneProductPage>
  );
}
