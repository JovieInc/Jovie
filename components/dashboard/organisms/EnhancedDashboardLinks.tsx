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
import { getSocialPlatformLabel, type SocialPlatform } from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { EnhancedDashboardLayout } from './EnhancedDashboardLayout';

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

// Minimal shape sometimes received back from EnhancedDashboardLayout before normalization
type ExternalLayoutLink = {
  id?: string;
  title?: string;
  url: string;
  platform: string; // platform id
  category?: 'music' | 'social' | 'commerce' | 'other';
  isVisible?: boolean;
};

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
        const input = Array.isArray(args[0])
          ? (args[0] as Array<LinkItem | ExternalLayoutLink>)
          : ([] as Array<LinkItem | ExternalLayoutLink>);
        // Normalize into LinkItem[]
        const normalized: LinkItem[] = input.map(item => {
          if (typeof (item as ExternalLayoutLink).platform === 'string') {
            const e = item as ExternalLayoutLink;
            const mappedCategory: PlatformType =
              e.category === 'music'
                ? 'dsp'
                : e.category === 'social'
                  ? 'social'
                  : 'custom';
            return {
              id: e.id ?? `temp-${Date.now()}`,
              title: e.title ?? 'Custom Link',
              url: e.url,
              platform: {
                id: e.platform,
                name: e.title ?? 'Custom Link',
                category: mappedCategory,
                icon: e.platform,
                color: '#000000',
                placeholder: 'https://example.com',
              },
              isVisible: e.isVisible ?? true,
              order: 0,
              category: mappedCategory,
              normalizedUrl: e.url,
              originalUrl: e.url,
              suggestedTitle: e.title ?? 'Custom Link',
              isValid: true,
            };
          }
          return item as LinkItem;
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

  // Handle adding a new link
  const handleAddLink = useCallback(() => {
    const newLink: LinkItem = {
      id: `temp-${Date.now()}`,
      title: 'New Link',
      platform: {
        id: 'custom',
        name: 'Custom Link',
        category: 'custom',
        icon: 'link',
        color: '#000000',
        placeholder: 'https://example.com',
      },
      isVisible: true,
      order: links.length,
      category: 'custom',
      normalizedUrl: '',
      originalUrl: '',
      suggestedTitle: 'New Link',
      isValid: false,
      url: '',
    };

    const updatedLinks = [...links, newLink];
    setLinks(updatedLinks);
    debouncedSave(updatedLinks);
  }, [links, debouncedSave]);

  // Handle editing a link
  const handleEditLink = useCallback((id: string) => {
    // In a real implementation, this would open an edit modal or form
    console.log('Edit link:', id);
    toast.info('Edit link functionality will be implemented in the next phase');
  }, []);

  // Handle deleting a link
  const handleDeleteLink = useCallback(
    (id: string) => {
      const updatedLinks = links.filter(link => link.id !== id);
      setLinks(updatedLinks);
      debouncedSave(updatedLinks);
      toast.success('Link removed');
    },
    [links, debouncedSave]
  );

  // Handle toggling link visibility
  const handleToggleVisibility = useCallback(
    (id: string) => {
      const updatedLinks = links.map(link =>
        link.id === id ? { ...link, isVisible: !link.isVisible } : link
      );
      setLinks(updatedLinks);
      debouncedSave(updatedLinks);
    },
    [links, debouncedSave]
  );

  // Handle reordering links
  const handleReorderLinks = useCallback(
    (items: Array<LinkItem | ExternalLayoutLink>) => {
      // Convert back to our internal LinkItem type if needed
      const reorderedLinks = items.map(item => {
        if ('platform' in item && typeof item.platform === 'string') {
          // This is coming from EnhancedDashboardLayout
          return {
            ...item,
            platform: {
              id: item.platform,
              name: item.title || 'Custom Link',
              category:
                item.category === 'music'
                  ? 'dsp'
                  : item.category === 'social'
                    ? 'social'
                    : 'custom',
              icon: item.platform,
              color: '#000000',
              placeholder: 'https://example.com',
            },
            normalizedUrl: item.url,
            originalUrl: item.url,
            suggestedTitle: item.title,
            isValid: true,
          } as LinkItem;
        }
        return item as LinkItem;
      });

      setLinks(reorderedLinks);
      debouncedSave(reorderedLinks);
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
        <EnhancedDashboardLayout
          links={dashboardLinks}
          onAddLink={handleAddLink}
          onEditLink={handleEditLink}
          onDeleteLink={handleDeleteLink}
          onToggleVisibility={handleToggleVisibility}
          onReorderLinks={handleReorderLinks}
        />
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
