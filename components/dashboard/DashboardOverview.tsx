'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface DashboardOverviewProps {
  initialData: DashboardData;
}

export function DashboardOverview({ initialData }: DashboardOverviewProps) {
  const [artist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );

  // Fetch social links to determine completion status
  useEffect(() => {
    if (!artist?.id) return;
    
    const fetchSocialLinks = async () => {
      try {
        const response = await fetch(`/api/dashboard/social-links?profileId=${artist.id}`);
        if (response.ok) {
          const data = await response.json();
          setHasSocialLinks(data.links && data.links.length > 0);
        }
      } catch (error) {
        console.error('Error fetching social links:', error);
        // Keep hasSocialLinks as false on error
      }
    };
    
    fetchSocialLinks();
  }, [artist?.id]);

  if (!artist) {
    return null; // This shouldn't happen given the server-side logic
  }

  // Check setup completion status
  const isHandleClaimed = Boolean(artist.owner_user_id);
  const hasMusicLink = Boolean(
    artist.spotify_url || artist.apple_music_url || artist.youtube_url
  );
  const [hasSocialLinks, setHasSocialLinks] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const allTasksComplete = isHandleClaimed && hasMusicLink && hasSocialLinks;

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Dashboard</h1>
        <p className='text-secondary-token mt-1'>
          Welcome back, {artist.name || 'Artist'}
        </p>
      </div>

      {/* Setup Tasks */}
      <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
        <h3 className='text-lg font-medium text-primary-token mb-4'>
          {allTasksComplete ? 'Profile Ready!' : 'Complete Your Setup'}
        </h3>

        {allTasksComplete ? (
          <div className='space-y-4'>
            <div className='flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800'>
              <div className='flex-shrink-0'>
                <div className='h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center'>
                  <span className='text-lg'>🎉</span>
                </div>
              </div>
              <div className='flex-1'>
                <p className='text-sm font-medium text-primary-token'>
                  Your profile is ready!
                </p>
                <p className='text-xs text-secondary-token mt-1'>
                  You&apos;ve completed all the essential setup steps.
                </p>
              </div>
            </div>

            <div className='flex gap-3'>
              <Link
                href={`/${artist.handle}`}
                target='_blank'
                className='flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors text-center text-sm font-medium'
              >
                View Profile
              </Link>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${getBaseUrl()}/${artist.handle}`
                    );
                    setCopyStatus('success');
                    setTimeout(() => setCopyStatus('idle'), 2000);
                  } catch (error) {
                    console.error('Failed to copy URL:', error);
                    setCopyStatus('error');
                    setTimeout(() => setCopyStatus('idle'), 2000);
                  }
                }}
                className='flex-1 px-4 py-2 bg-surface-2 text-primary-token rounded-lg hover:bg-surface-3 transition-colors text-center text-sm font-medium'
              >
                {copyStatus === 'success' ? '✓ Copied!' : copyStatus === 'error' ? 'Failed to copy' : 'Copy URL'}
              </button>
            </div>
          </div>
        ) : (
          <div className='space-y-3'>
            {/* Task 1: Claim Handle */}
            <div className='flex items-center gap-3 p-3 rounded-lg border border-subtle'>
              <div className='flex-shrink-0'>
                <div
                  className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${
                    isHandleClaimed
                      ? 'bg-green-500 border-green-500'
                      : 'border-surface-3'
                  }`}
                >
                  {isHandleClaimed && (
                    <svg
                      className='w-3 h-3 text-white'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                    >
                      <path
                        fillRule='evenodd'
                        d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                        clipRule='evenodd'
                      />
                    </svg>
                  )}
                </div>
              </div>
              <div className='flex-1'>
                <p className='text-sm font-medium text-primary-token'>
                  1. Claim your handle
                </p>
                <p className='text-xs text-secondary-token'>
                  {isHandleClaimed
                    ? 'Handle claimed'
                    : 'Secure your unique profile URL'}
                </p>
              </div>
              {!isHandleClaimed && (
                <Link
                  href='/dashboard/settings'
                  className='text-sm text-accent hover:text-accent/80 font-medium'
                >
                  Complete →
                </Link>
              )}
            </div>

            {/* Task 2: Add Music Link */}
            <div className='flex items-center gap-3 p-3 rounded-lg border border-subtle'>
              <div className='flex-shrink-0'>
                <div
                  className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${
                    hasMusicLink
                      ? 'bg-green-500 border-green-500'
                      : 'border-surface-3'
                  }`}
                >
                  {hasMusicLink && (
                    <svg
                      className='w-3 h-3 text-white'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                    >
                      <path
                        fillRule='evenodd'
                        d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                        clipRule='evenodd'
                      />
                    </svg>
                  )}
                </div>
              </div>
              <div className='flex-1'>
                <p className='text-sm font-medium text-primary-token'>
                  2. Add a music link
                </p>
                <p className='text-xs text-secondary-token'>
                  {hasMusicLink
                    ? 'Music link added'
                    : 'Connect Spotify, Apple Music, or YouTube'}
                </p>
              </div>
              {!hasMusicLink && (
                <Link
                  href='/dashboard/links'
                  className='text-sm text-accent hover:text-accent/80 font-medium'
                >
                  Add →
                </Link>
              )}
            </div>

            {/* Task 3: Add Social Links */}
            <div className='flex items-center gap-3 p-3 rounded-lg border border-subtle'>
              <div className='flex-shrink-0'>
                <div
                  className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${
                    hasSocialLinks
                      ? 'bg-green-500 border-green-500'
                      : 'border-surface-3'
                  }`}
                >
                  {hasSocialLinks && (
                    <svg
                      className='w-3 h-3 text-white'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                    >
                      <path
                        fillRule='evenodd'
                        d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                        clipRule='evenodd'
                      />
                    </svg>
                  )}
                </div>
              </div>
              <div className='flex-1'>
                <p className='text-sm font-medium text-primary-token'>
                  3. Add social links
                </p>
                <p className='text-xs text-secondary-token'>
                  {hasSocialLinks
                    ? 'Social links added'
                    : 'Connect Instagram, TikTok, Twitter, etc.'}
                </p>
              </div>
              {!hasSocialLinks && (
                <Link
                  href='/dashboard/links'
                  className='text-sm text-accent hover:text-accent/80 font-medium'
                >
                  Add →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
