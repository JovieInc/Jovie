'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { BASE_URL } from '@/constants/domains';
import { CopyToClipboardButton } from '@/features/dashboard/molecules/CopyToClipboardButton';
import { StatusBarMock } from '@/features/dashboard/molecules/StatusBarMock';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import { useDashboardSocialLinksQuery } from '@/lib/queries';
import type { Artist, LegacySocialLink } from '@/types/db';

/**
 * DSP platforms excluded from social link preview (shown separately in music section).
 * Defined at module scope to avoid creating a new Set instance on every render.
 */
const DSP_PLATFORMS = new Set([
  'spotify',
  'apple_music',
  'youtube_music',
  'soundcloud',
  'bandcamp',
  'tidal',
  'deezer',
]);

interface DashboardPreviewProps {
  readonly artist: Artist;
  readonly socialLinksOverride?: LegacySocialLink[];
}

export function DashboardPreview({
  artist,
  socialLinksOverride,
}: DashboardPreviewProps) {
  // Fetch links via TanStack Query (skip if override provided)
  const { data: socialLinks = [] } = useDashboardSocialLinksQuery(artist.id);

  // Convert social links to LegacySocialLink format for preview
  const previewSocialLinks = useMemo((): LegacySocialLink[] => {
    if (socialLinksOverride) return socialLinksOverride;
    return socialLinks
      .filter(link => !DSP_PLATFORMS.has(link.platform))
      .map(link => ({
        id: link.id,
        artist_id: artist.id,
        platform: link.platform,
        url: link.url,
        clicks: 0,
        created_at: new Date().toISOString(),
      }));
  }, [socialLinks, socialLinksOverride, artist.id]);

  // Clipboard handled by CopyToClipboardButton atom

  return (
    <div data-testid='dashboard-preview'>
      <div className='mb-4'>
        <h3 className='text-lg font-caption text-primary-token'>
          Live Preview
        </h3>
        <p className='text-app text-secondary-token mt-1'>
          This is how your profile will appear to visitors
        </p>
      </div>

      {/* Mobile Frame Preview */}
      <div className='flex justify-center'>
        <div className='relative w-[280px] rounded-[28px] border border-(--linear-app-frame-seam) bg-surface-1 p-2 transition-transform duration-300 hover:scale-[1.01]'>
          {/* Top notch */}
          <div className='absolute left-1/2 top-2 z-10 h-3 w-20 -translate-x-1/2 rounded-b-[10px] bg-surface-1'></div>

          <div
            className='relative overflow-hidden rounded-[24px] border border-(--linear-app-frame-seam) bg-surface-0'
            style={{ height: '500px' }}
          >
            {/* Status Bar Mockup */}
            <StatusBarMock />

            {/* Profile Preview - Better scaling and positioning */}
            <div
              className='flex-1 bg-surface-1 relative overflow-hidden'
              style={{ height: 'calc(100% - 28px)' }}
            >
              <div className='w-full h-full overflow-y-auto'>
                <StaticArtistPage
                  presentation='compact-preview'
                  mode='profile'
                  artist={artist}
                  socialLinks={previewSocialLinks}
                  subtitle=''
                  showBackButton={false}
                  contacts={[]}
                  showFooter={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile URL and Actions */}
      <div className='pt-4 text-center space-y-3'>
        <div className='flex items-center justify-center gap-2'>
          <code className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-0 px-2 py-1 text-2xs text-secondary-token'>
            {BASE_URL}/{artist.handle || 'username'}
          </code>
          <CopyToClipboardButton
            relativePath={`/${artist.handle || 'username'}`}
            idleLabel='Copy'
            successLabel='Copied!'
            errorLabel='Failed to copy'
          />
        </div>
        <Link
          href={`/${artist.handle}`}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex items-center gap-1.5 text-app font-caption text-accent hover:text-accent/80 transition-colors'
        >
          View Profile
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
            aria-hidden='true'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}
