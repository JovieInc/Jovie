'use client';

import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DashboardData, ProfileSocialLink } from '@/app/dashboard/actions';
import type { LinkItemData } from '@/components/atoms/LinkItem';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { EnhancedLinkManager } from '@/components/organisms/EnhancedLinkManager';
import { debounce } from '@/lib/utils';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';
import { getSocialPlatformLabel, type SocialPlatform } from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

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
  initialData,
  initialLinks,
}: {
  initialData: DashboardData;
  initialLinks: ProfileSocialLink[];
}) {
  const [artist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );

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

          const response = await fetch('/api/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ links: payload }),
          });
          if (!response.ok) throw new Error('Failed to save links');

          const data: { links: Array<{ id: string; url: string }> } =
            await response.json();

          const updatedLinks: LinkItem[] = data.links.map((link, index) => {
            const existing = normalized.find(
              l => l.normalizedUrl === link.url
            )!;
            return { ...existing, id: link.id, order: index };
          });

          setLinks(updatedLinks);

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
    []
  );

  // Handle adding a new link with auto-detection
  const handleAddLink = useCallback(
    (url: string, detectedInfo?: DetectedLink) => {
      if (!detectedInfo) {
        detectedInfo = detectPlatform(url, artist?.name);
      }

      const category = getPlatformCategory(detectedInfo.platform.id);
      const platformCategory: PlatformType =
        category === 'dsp'
          ? 'dsp'
          : category === 'social'
            ? 'social'
            : 'custom';
      const platform: Platform = {
        id: detectedInfo.platform.id,
        name: detectedInfo.platform.name,
        category: platformCategory,
        icon: detectedInfo.platform.icon,
        color: detectedInfo.platform.color,
        placeholder: detectedInfo.platform.placeholder,
      };

      const newLink: LinkItem = {
        id: `temp-${Date.now()}`,
        title: detectedInfo.suggestedTitle,
        platform,
        isVisible: true,
        order: links.length,
        category,
        normalizedUrl: detectedInfo.normalizedUrl,
        originalUrl: url,
        suggestedTitle: detectedInfo.suggestedTitle,
        isValid: detectedInfo.isValid,
        url: detectedInfo.normalizedUrl,
      };

      const updatedLinks = [...links, newLink];
      setLinks(updatedLinks);
      debouncedSave(updatedLinks);
    },
    [links, debouncedSave, artist]
  );

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
    (reorderedLinkData: LinkItemData[]) => {
      // Convert LinkItemData back to our internal LinkItem format
      const reorderedLinks = reorderedLinkData.map((linkData, index) => {
        const category: PlatformType =
          linkData.category === 'music'
            ? 'dsp'
            : linkData.category === 'social'
              ? 'social'
              : 'custom';

        return {
          id: linkData.id,
          title: linkData.title,
          url: linkData.url,
          platform: {
            id: linkData.platform,
            name: linkData.title,
            category,
            icon: linkData.platform,
            color: '#000000',
            placeholder: 'https://example.com',
          },
          isVisible: linkData.isVisible,
          order: index,
          category,
          normalizedUrl: linkData.url,
          originalUrl: linkData.url,
          suggestedTitle: linkData.title,
          isValid: true,
        } as LinkItem;
      });

      setLinks(reorderedLinks);
      debouncedSave(reorderedLinks);
    },
    [debouncedSave]
  );

  // Handle moving link to different category
  const handleMoveToCategory = useCallback(
    (linkId: string, newCategory: string) => {
      const updatedLinks = links.map(link => {
        if (link.id === linkId) {
          const mappedCategory: PlatformType =
            newCategory === 'music'
              ? 'dsp'
              : newCategory === 'social'
                ? 'social'
                : 'custom';
          return {
            ...link,
            category: mappedCategory,
            platform: {
              ...link.platform,
              category: mappedCategory as PlatformType,
            },
          };
        }
        return link;
      });

      setLinks(updatedLinks);
      debouncedSave(updatedLinks);
      toast.success(
        `Link moved to ${newCategory === 'music' ? 'Music & Streaming' : newCategory === 'social' ? 'Social Media' : newCategory === 'commerce' ? 'Commerce & Payments' : 'Other Links'}`
      );
    },
    [links, debouncedSave]
  );

  // Get username and avatar for preview
  const username = artist?.name || 'username';
  const avatarUrl = artist?.image_url || null;

  // Convert links to the format expected by EnhancedLinkManager
  const linkManagerData = useMemo(
    (): LinkItemData[] =>
      links.map(link => {
        // Map internal category to LinkItemData category
        const mapCategory = (
          category: 'social' | 'dsp' | 'custom'
        ): 'music' | 'social' | 'commerce' | 'other' => {
          switch (category) {
            case 'dsp':
              return 'music';
            case 'social':
              return 'social';
            case 'custom':
              return 'other';
            default:
              return 'other';
          }
        };

        return {
          id: link.id,
          title: link.title,
          url: link.normalizedUrl || link.url,
          platform: link.platform.id,
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
        <EnhancedLinkManager
          links={linkManagerData}
          onAddLink={handleAddLink}
          onEditLink={handleEditLink}
          onDeleteLink={handleDeleteLink}
          onToggleVisibility={handleToggleVisibility}
          onReorderLinks={handleReorderLinks}
          onMoveToCategory={handleMoveToCategory}
          creatorName={artist?.name}
        />
      </div>

      {/* Right column: Live Preview (only on Links page) */}
      <aside className='hidden xl:block'>
        <div className='sticky top-6 space-y-6'>
          {/* Preview Container */}
          <div className='bg-surface-1 rounded-2xl p-6 shadow-sm border border-subtle'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>
                Live Preview
              </h2>
              <div className='text-sm text-gray-500 dark:text-gray-400'>
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
                links={linkManagerData}
                className='h-full w-full'
              />
            </div>
          </div>

          {/* URL Preview */}
          <div className='bg-surface-1 rounded-2xl p-6 shadow-sm border border-subtle'>
            <h3 className='text-sm font-medium text-gray-900 dark:text-white mb-3'>
              Your Profile URL
            </h3>
            <div className='flex flex-col sm:flex-row gap-2'>
              <div className='flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 font-mono truncate'>
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
            <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
              Share this link with your audience
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
