'use client';

import Link from 'next/link';
import React, { useMemo } from 'react';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { StatusBarMock } from '@/components/dashboard/molecules/StatusBarMock';
import { StaticArtistPage } from '@/components/profile/StaticArtistPage';
import { BASE_URL } from '@/constants/domains';
import { useDashboardSocialLinksQuery } from '@/lib/queries/useDashboardSocialLinksQuery';
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

export const DashboardPreview: React.FC<DashboardPreviewProps> = ({
  artist,
  socialLinksOverride,
}) => {
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
        <h3 className='text-lg font-medium text-primary-token'>Live Preview</h3>
        <p className='text-sm text-secondary-token mt-1'>
          This is how your profile will appear to visitors
        </p>
      </div>

      {/* Mobile Frame Preview */}
      <div className='flex justify-center'>
        <div className='relative w-[280px] rounded-4xl bg-surface-2 p-2 shadow-2xl ring-1 ring-subtle transform transition-transform hover:scale-[1.02] duration-300'>
          {/* Top notch */}
          <div className='absolute w-20 h-3 bg-surface-2 rounded-b-lg z-10 left-1/2 transform -translate-x-1/2 top-2'></div>

          <div
            className='bg-surface-1 rounded-3xl overflow-hidden relative'
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
                  mode='default'
                  artist={artist}
                  socialLinks={previewSocialLinks}
                  subtitle=''
                  showTipButton={false}
                  showBackButton={false}
                  contacts={[]}
                  showFooter={false}
                  autoOpenCapture={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile URL and Actions */}
      <div className='pt-4 text-center space-y-3'>
        <div className='flex items-center justify-center gap-2'>
          <code className='text-xs bg-surface-2 px-2 py-1 rounded text-secondary-token'>
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
          className='inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors'
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
};
