'use client';

import { useSession } from '@clerk/nextjs';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { StaticArtistPage } from '@/components/profile/StaticArtistPage';
import type { Artist, LegacySocialLink, SocialLink } from '@/types/db';

interface DashboardPreviewProps {
  artist: Artist;
  socialLinksOverride?: LegacySocialLink[];
}

export const DashboardPreview: React.FC<DashboardPreviewProps> = ({
  artist,
  socialLinksOverride,
}) => {
  const { session } = useSession();
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);

  // Initialize links from database
  useEffect(() => {
    if (socialLinksOverride) return; // use override instead of fetching

    const fetchLinks = async () => {
      if (!session || !artist.id) return;

      try {
        const res = await fetch(
          `/api/dashboard/social-links?profileId=${encodeURIComponent(artist.id)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error(`Failed to fetch links (${res.status})`);
        const json: { links: SocialLink[] } = await res.json();

        setSocialLinks(json.links || []);
      } catch (error) {
        console.error('Error fetching links:', error);
      }
    };

    fetchLinks();
  }, [session, artist.id, socialLinksOverride]);

  // Convert social links to LegacySocialLink format for preview
  const previewSocialLinks = useMemo((): LegacySocialLink[] => {
    if (socialLinksOverride) return socialLinksOverride;
    return socialLinks
      .filter(
        link =>
          link.platform !== 'spotify' &&
          link.platform !== 'apple_music' &&
          link.platform !== 'youtube_music' &&
          link.platform !== 'soundcloud' &&
          link.platform !== 'bandcamp' &&
          link.platform !== 'tidal' &&
          link.platform !== 'deezer'
      )
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
    <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
      <div className='p-4 border-b border-subtle'>
        <h3 className='text-lg font-medium text-primary-token'>Live Preview</h3>
        <p className='text-sm text-secondary-token mt-1'>
          This is how your profile will appear to visitors
        </p>
      </div>

      {/* Mobile Frame Preview */}
      <div className='flex justify-center p-4'>
        <div className='w-[280px] bg-gray-900 dark:bg-gray-800 rounded-[2rem] p-2 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 transform transition-transform hover:scale-[1.02] duration-300'>
          {/* Top notch */}
          <div className='absolute w-20 h-3 bg-gray-900 dark:bg-gray-800 rounded-b-lg z-10 left-1/2 transform -translate-x-1/2 top-2'></div>

          <div
            className='bg-white dark:bg-gray-900 rounded-[1.6rem] overflow-hidden relative'
            style={{ height: '500px' }}
          >
            {/* Status Bar Mockup */}
            <div className='bg-gray-100 dark:bg-gray-800 h-7 flex items-center justify-between px-4 relative z-20'>
              <span className='text-[10px] font-semibold text-gray-900 dark:text-gray-100'>
                9:41
              </span>
              <div className='flex items-center gap-1'>
                {/* Signal bars */}
                <div className='flex items-end gap-0.5'>
                  <div className='w-0.5 h-1 bg-gray-900 dark:bg-gray-100 rounded'></div>
                  <div className='w-0.5 h-1.5 bg-gray-900 dark:bg-gray-100 rounded'></div>
                  <div className='w-0.5 h-2 bg-gray-900 dark:bg-gray-100 rounded'></div>
                  <div className='w-0.5 h-2.5 bg-gray-900 dark:bg-gray-100 rounded'></div>
                </div>
                {/* Battery */}
                <div className='w-5 h-3 border border-gray-900 dark:border-gray-100 rounded-sm relative'>
                  <div className='w-full h-full bg-green-500 rounded-sm scale-x-80 origin-left'></div>
                  <div className='absolute -right-0.5 top-0.5 w-0.5 h-2 bg-gray-900 dark:bg-gray-100 rounded-r-sm'></div>
                </div>
              </div>
            </div>

            {/* Profile Preview - Better scaling and positioning */}
            <div
              className='flex-1 bg-white dark:bg-gray-900 relative overflow-hidden'
              style={{ height: 'calc(100% - 28px)' }}
            >
              <div className='w-full h-full overflow-y-auto'>
                <div
                  className='w-full animate-in fade-in duration-300'
                  style={{
                    transform: 'scale(0.85)',
                    transformOrigin: 'top center',
                    minHeight: '100%',
                  }}
                >
                  <StaticArtistPage
                    mode='default'
                    artist={artist}
                    socialLinks={previewSocialLinks}
                    subtitle=''
                    showTipButton={false}
                    showBackButton={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile URL and Actions */}
      <div className='border-t border-subtle p-4 text-center space-y-3'>
        <div className='flex items-center justify-center gap-2'>
          <code className='text-xs bg-surface-2 px-2 py-1 rounded text-secondary-token'>
            jov.ie/{artist.handle || 'username'}
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
