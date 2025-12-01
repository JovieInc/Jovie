'use client';

import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/dashboard/actions';
import { useDashboardData } from '@/app/dashboard/DashboardDataContext';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { debounce } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { getSocialPlatformLabel, type SocialPlatform } from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { GroupedLinksManager } from './GroupedLinksManager';

// Define platform types
type PlatformType = 'social' | 'dsp' | 'custom';

interface Platform {
  id: string;
  name: string;
  category: PlatformType;
  icon: string;
  color: string;
  placeholder: string;
}

interface LinkItem {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  isVisible: boolean;
  order: number;
  category: PlatformType;
  normalizedUrl: string;
  originalUrl: string;
  suggestedTitle: string;
  isValid: boolean;
}

interface SaveStatus {
  saving: boolean;
  success: boolean | null;
  error: string | null;
  lastSaved: Date | null;
}

export function EnhancedDashboardLinks({
  initialLinks,
}: {
  initialLinks: ProfileSocialLink[];
}) {
  const dashboardData = useDashboardData();
  const [artist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
  const profileId = dashboardData.selectedProfile?.id;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    saving: false,
    success: null,
    error: null,
    lastSaved: null,
  });

  // Categorize platforms
  const getPlatformCategory = (
    platform: string
  ): 'social' | 'dsp' | 'custom' => {
    const dspPlatforms = new Set([
      'spotify',
      'apple_music',
      'youtube_music',
      'soundcloud',
      'bandcamp',
      'tidal',
      'deezer',
      'amazon_music',
      'pandora',
    ]);

    const socialPlatforms = new Set([
      'instagram',
      'twitter',
      'tiktok',
      'youtube',
      'facebook',
      'twitch',
      'shopify',
      'etsy',
      'amazon',
      'patreon',
      'buy_me_a_coffee',
      'kofi',
      'paypal',
      'venmo',
      'cashapp',
    ]);

    if (dspPlatforms.has(platform)) return 'dsp';
    if (socialPlatforms.has(platform)) return 'social';
    return 'custom';
  };

  // Convert database social links to LinkItem format
  const convertDbLinksToLinkItems = useCallback(
    (dbLinks: ProfileSocialLink[] = []): LinkItem[] => {
      return dbLinks.map((link, index) => {
        const displayName = getSocialPlatformLabel(
          link.platform as SocialPlatform
        );
        const category = getPlatformCategory(link.platform);
        const platform: Platform = {
          id: link.platform,
          name: displayName,
          category,
          icon: link.platform,
          color: '#000000',
          placeholder: link.url,
        };

        return {
          id: link.id,
          title: displayName,
          platform,
          normalizedUrl: link.url,
          originalUrl: link.url,
          suggestedTitle: displayName,
          isValid: true,
          isVisible: link.isActive ?? true,
          order: typeof link.sortOrder === 'number' ? link.sortOrder : index,
          category,
          url: link.url,
        };
      });
    },
    []
  );

  // Initialize links from server props
  const [links, setLinks] = useState<LinkItem[]>(() => {
    return convertDbLinksToLinkItems(initialLinks || []);
  });

  // Save links to database (debounced)
  const debouncedSave = useMemo(
    () =>
      debounce(async (...args: unknown[]) => {
        const [input] = args as [LinkItem[]];

        const normalized: LinkItem[] = input.map((item, index) => {
          const rawCategory = item.platform.category;
          const category: PlatformType =
            rawCategory === 'dsp' || rawCategory === 'social'
              ? rawCategory
              : 'custom';

          return {
            ...item,
            category,
            order: typeof item.order === 'number' ? item.order : index,
          };
        });

        try {
          setSaveStatus(prev => ({ ...prev, saving: true }));

          const payload = normalized.map((l, index) => ({
            platform: l.platform.id,
            url: l.normalizedUrl,
            sortOrder: index,
            isActive: l.isVisible !== false,
            displayText: l.title,
          }));

          if (!profileId) {
            setSaveStatus({
              saving: false,
              success: false,
              error:
                'Missing profile id; please refresh the page and try again.',
              lastSaved: null,
            });
            toast.error('Unable to save links. Please refresh and try again.');
            return;
          }

          const response = await fetch('/api/dashboard/social-links', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId, links: payload }),
          });
          if (!response.ok) throw new Error('Failed to save links');

          // Keep normalized links locally; server IDs will be applied on next load
          setLinks(normalized);

          const now = new Date();
          setSaveStatus({
            saving: false,
            success: true,
            error: null,
            lastSaved: now,
          });
          toast.success(
            `Links saved successfully. Last saved: ${now.toLocaleTimeString()}`
          );
        } catch (error) {
          console.error('Error saving links:', error);
          setSaveStatus({
            saving: false,
            success: false,
            error:
              error instanceof Error ? error.message : 'Failed to save links',
            lastSaved: null,
          });
          toast.error('Failed to save links. Please try again.');
        }
      }, 500),
    [profileId]
  );

  const handleManagerLinksChange = useCallback(
    (updated: DetectedLink[]) => {
      const mapped: LinkItem[] = updated.map((link, index) => {
        const rawVisibility = (link as unknown as { isVisible?: boolean })
          .isVisible;
        const isVisible = rawVisibility ?? true;
        const rawCategory = link.platform.category;
        const category: PlatformType =
          rawCategory === 'dsp' || rawCategory === 'social'
            ? rawCategory
            : 'custom';

        const idBase = link.normalizedUrl || link.originalUrl;

        return {
          id: `${link.platform.id}::${category}::${idBase}`,
          title: link.suggestedTitle || link.platform.name,
          url: link.normalizedUrl,
          platform: {
            id: link.platform.id,
            name: link.platform.name,
            category,
            icon: link.platform.icon,
            color: `#${link.platform.color}`,
            placeholder: link.platform.placeholder,
          },
          isVisible,
          order: index,
          category,
          normalizedUrl: link.normalizedUrl,
          originalUrl: link.originalUrl,
          suggestedTitle: link.suggestedTitle,
          isValid: link.isValid,
        };
      });

      setLinks(mapped);
      debouncedSave(mapped);
    },
    [debouncedSave]
  );

  // Get username and avatar for preview
  const username = artist?.name || 'username';
  const avatarUrl = artist?.image_url || null;

  // Convert links to the format expected by EnhancedDashboardLayout
  const dashboardLinks = useMemo(
    () =>
      links.map(link => {
        // Map our internal category type to the expected category type in EnhancedDashboardLayout
        const mapCategory = (
          category: 'social' | 'dsp' | 'custom'
        ): 'social' | 'music' | 'commerce' | 'other' | undefined => {
          switch (category) {
            case 'dsp':
              return 'music';
            case 'social':
              return 'social';
            case 'custom':
              return 'other';
            default:
              return undefined;
          }
        };

        return {
          id: link.id,
          title: link.title,
          url: link.normalizedUrl,
          platform: link.platform.id as
            | 'instagram'
            | 'twitter'
            | 'tiktok'
            | 'youtube'
            | 'spotify'
            | 'applemusic'
            | 'custom',
          isVisible: link.isVisible,
          category: mapCategory(link.category),
        };
      }),
    [links]
  );

  // Prepare links for the phone preview component
  // previewLinks reserved for future PhoneMockupPreview integration.

  const profilePath = `/${artist?.handle || 'username'}`;

  return (
    <div className='grid grid-cols-1 xl:grid-cols-[1fr_24rem] gap-6'>
      <div className='w-full'>
        <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
          <div className='mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h1 className='text-2xl font-bold text-primary-token'>
                Manage Links
              </h1>
              <p className='mt-1 text-sm text-secondary-token'>
                Add and manage your social and streaming links. Changes save
                automatically.
                {saveStatus.lastSaved && (
                  <span className='ml-2 text-xs text-secondary-token'>
                    Last saved: {saveStatus.lastSaved.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
          </div>

          <GroupedLinksManager
            initialLinks={links as unknown as DetectedLink[]}
            onLinksChange={handleManagerLinksChange}
            creatorName={artist?.name ?? undefined}
          />
        </div>
      </div>

      {/* Right column: Live Preview (only on Links page) */}
      <aside className='hidden xl:block'>
        <div className='sticky top-6 space-y-6'>
          {/* Preview Container */}
          <div className='bg-surface-1 rounded-2xl p-6 shadow-sm border border-subtle'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-lg font-semibold text-primary-token'>
                Live Preview
              </h2>
              <div className='text-sm text-secondary-token'>
                Last saved:{' '}
                {saveStatus.lastSaved
                  ? saveStatus.lastSaved.toLocaleTimeString()
                  : '—'}
              </div>
            </div>
            <div className='h-[600px] w-full overflow-hidden rounded-xl border border-subtle'>
              <ProfilePreview
                username={username}
                avatarUrl={avatarUrl || null}
                links={dashboardLinks}
                className='h-full w-full'
              />
            </div>
          </div>

          {/* URL Preview */}
          <div className='bg-surface-1 rounded-2xl p-6 shadow-sm border border-subtle'>
            <h3 className='text-sm font-medium text-primary-token mb-3'>
              Your Profile URL
            </h3>
            <div className='flex flex-col sm:flex-row gap-2'>
              <div className='flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm text-primary-token font-mono truncate'>
                {typeof window !== 'undefined'
                  ? `${window.location.origin}${profilePath}`
                  : 'Loading...'}
              </div>
              <div className='flex gap-2'>
                <CopyToClipboardButton
                  relativePath={profilePath}
                  idleLabel='Copy'
                  successLabel='Copied!'
                />
                <Button
                  asChild
                  variant='outline'
                  size='sm'
                  className='shrink-0 flex-1 sm:flex-initial whitespace-nowrap'
                >
                  <Link
                    href={profilePath}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <ArrowTopRightOnSquareIcon className='h-4 w-4 mr-1.5' />
                    Open
                  </Link>
                </Button>
              </div>
            </div>
            <p className='mt-2 text-xs text-secondary-token'>
              Share this link with your audience
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
