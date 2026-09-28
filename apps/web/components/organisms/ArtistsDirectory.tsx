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
  /** Total claimed public profiles; falls back to the current page size. */
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
  total,
  nextCursor = null,
  isFirstPage = true,
}: Readonly<ArtistsDirectoryProps>) {
  const totalCount = total ?? profiles.length;
  return (
    <StandaloneProductPage width='xl'>
      <div className='space-y-6' data-testid='artists-directory'>
        <ContentSurfaceCard surface='details'>
          <ContentSectionHeader
            density='compact'
            headingLevel='h1'
            title='All artists'
            subtitle='Discover public creator profiles across Jovie.'
          />
          <div className='grid grid-cols-1 gap-3 p-3 pt-0 sm:grid-cols-3 sm:p-4 sm:pt-0'>
            <ContentSurfaceCard surface='nested'>
              <div className='space-y-1 p-4'>
                <p className='text-2xl font-semibold tracking-[-0.03em] text-primary-token'>
                  {totalCount}
                </p>
                <p className='text-xs font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                  Public profiles
                </p>
                <p className='text-app leading-5 text-secondary-token'>
                  Creator pages currently available to browse.
                </p>
              </div>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested'>
              <div className='space-y-1 p-4'>
                <p className='text-app font-semibold text-primary-token'>
                  Discover artists
                </p>
                <p className='text-app leading-5 text-secondary-token'>
                  Browse creator pages, profile themes, and public fan
                  experiences.
                </p>
              </div>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested'>
              <div className='space-y-1 p-4'>
                <p className='text-app font-semibold text-primary-token'>
                  Jump straight in
                </p>
                <p className='text-app leading-5 text-secondary-token'>
                  Every card opens the artist&apos;s public profile in one
                  click.
                </p>
              </div>
            </ContentSurfaceCard>
          </div>
        </ContentSurfaceCard>

        {totalCount > profiles.length ? (
          <p
            className='text-xs text-tertiary-token'
            data-testid='artists-directory-page-note'
          >
            Showing {profiles.length} of {totalCount} public profiles.
          </p>
        ) : null}

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
                    {profile.bio ? (
                      <p className='line-clamp-3 text-app leading-5 text-secondary-token'>
                        {profile.bio}
                      </p>
                    ) : (
                      <p className='text-app leading-5 text-tertiary-token'>
                        Public creator profile on Jovie.
                      </p>
                    )}
                  </div>

                  <span className='inline-flex items-center gap-1 text-xs font-semibold text-tertiary-token transition-colors group-hover:text-primary-token'>
                    View profile
                    <Icon name='ChevronRight' className='h-4 w-4' />
                  </span>
                </Link>
              </ContentSurfaceCard>
            ))}
          </div>
        ) : (
          <ContentSurfaceCard surface='details'>
            <div className='px-5 py-8 text-center sm:px-6'>
              <p className='text-mid font-semibold text-primary-token'>
                No profiles found
              </p>
              <p className='mt-2 text-app leading-5 text-secondary-token'>
                Check back later for new creator profiles.
              </p>
            </div>
          </ContentSurfaceCard>
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
