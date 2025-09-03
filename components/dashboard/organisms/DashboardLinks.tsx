'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import type { ProfileSocialLink } from '@/app/dashboard/actions';
// flags import removed - pre-launch
import { debounce } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import {
  type Artist,
  convertDrizzleCreatorProfileToArtist,
  type LegacySocialLink,
} from '@/types/db';
import { UnifiedLinkManager } from '../molecules/UnifiedLinkManager';
import { DashboardPreview } from './DashboardPreview';

interface LinkItem extends DetectedLink {
  id: string;
  title: string;
  isVisible: boolean;
  order: number;
}

interface DashboardLinksProps {
  initialData: DashboardData;
  initialLinks: ProfileSocialLink[];
}

interface SaveStatus {
  saving: boolean;
  success: boolean | null;
  error: string | null;
  lastSaved: Date | null;
}

export function DashboardLinks({
  initialData,
  initialLinks,
}: DashboardLinksProps) {
  const [artist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );
  // Convert database social links to LinkItem format
  const convertDbLinksToLinkItems = (
    dbLinks: ProfileSocialLink[] = []
  ): LinkItem[] => {
    return dbLinks.map((link, index) => {
      // Determine platform category based on platform name
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

      const platformCategory = dspPlatforms.has(link.platform)
        ? 'dsp'
        : 'social';

      return {
        id: link.id,
        title: link.platform,
        platform: {
          id: link.platform,
          name: link.platform,
          category: platformCategory,
          icon: link.platform,
          color: '#000000',
          placeholder: link.url,
        },
        normalizedUrl: link.url,
        originalUrl: link.url,
        suggestedTitle: link.platform,
        isValid: true,
        isVisible: link.isActive ?? true,
        order: typeof link.sortOrder === 'number' ? link.sortOrder : index,
      };
    });
  };

  // Initialize from server-provided props to avoid client fetch
  const initialLinkItems = useMemo(
    () => convertDbLinksToLinkItems(initialLinks || []),
    [initialLinks]
  );
  const [socialLinks, setSocialLinks] = useState<LinkItem[]>(() =>
    initialLinkItems.filter(link => link.platform.category === 'social')
  );
  const [dspLinks, setDSPLinks] = useState<LinkItem[]>(() =>
    initialLinkItems.filter(link => link.platform.category === 'dsp')
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    saving: false,
    success: null,
    error: null,
    lastSaved: null,
  });
  const updateIndicatorRef = useRef<HTMLDivElement>(null);

  // Convert LinkItems to database format
  type APILinkPayload = {
    platform: string;
    url: string;
    sortOrder?: number;
    isActive?: boolean;
    displayText?: string;
  };

  const convertLinkItemsToDbFormat = useCallback(
    (linkItems: LinkItem[]): APILinkPayload[] => {
      return linkItems
        .filter(link => link.isVisible)
        .map((link, index) => ({
          platform: link.platform.id,
          url: link.normalizedUrl,
          sortOrder: index,
          isActive: true,
        }));
    },
    []
  );

  // No client fetch; initial links are provided by the server via props

  // Convert current links to unified LinkItem format
  const initialAllLinks = useMemo(() => {
    return [...socialLinks, ...dspLinks].sort((a, b) => a.order - b.order);
  }, [socialLinks, dspLinks]);

  // Convert social LinkItems to LegacySocialLink format for preview
  const previewSocialLinks = useMemo((): LegacySocialLink[] => {
    return socialLinks
      .filter(link => link.isVisible && link.platform.category === 'social')
      .map(link => ({
        id: link.id,
        artist_id: artist!.id, // LegacySocialLink still uses artist_id for backwards compatibility
        platform: link.platform.icon,
        url: link.normalizedUrl,
        clicks: 0,
        created_at: new Date().toISOString(),
      }))
      .sort((a, b) => {
        const aIndex = socialLinks.findIndex(l => l.id === a.id);
        const bIndex = socialLinks.findIndex(l => l.id === b.id);
        return aIndex - bIndex;
      });
  }, [socialLinks, artist]);

  // Create preview artist object
  const previewArtist = useMemo(
    (): Artist => ({
      ...artist!,
      // Apply any real-time changes here
    }),
    [artist]
  );

  // Show update indicator
  const showUpdateIndicator = useCallback((success: boolean) => {
    if (updateIndicatorRef.current) {
      updateIndicatorRef.current.dataset.show = 'true';
      // Safe alternative to innerHTML - use textContent to prevent XSS
      updateIndicatorRef.current.textContent = success
        ? '✅ Updated'
        : '❌ Error';
      updateIndicatorRef.current.className = success
        ? 'bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium'
        : 'bg-red-500 text-white px-3 py-1 rounded-full text-xs font-medium';

      setTimeout(() => {
        if (updateIndicatorRef.current) {
          updateIndicatorRef.current.dataset.show = 'false';
        }
      }, 2000);
    }
  }, []);

  // Clipboard copy handled by CopyToClipboardButton atom

  // Save links to database
  const saveLinks = useCallback(
    async (socialLinksToSave: LinkItem[], dspLinksToSave: LinkItem[]) => {
      if (!artist?.id) return;

      setSaveStatus(prev => ({
        ...prev,
        saving: true,
        success: null,
        error: null,
      }));

      try {
        // Convert links to database format for API payload
        const allLinks = [
          ...convertLinkItemsToDbFormat(socialLinksToSave),
          ...convertLinkItemsToDbFormat(dspLinksToSave),
        ];

        const res = await fetch('/api/dashboard/social-links', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: artist.id, links: allLinks }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(`Failed to save links: ${err?.error ?? res.status}`);
        }

        setSaveStatus({
          saving: false,
          success: true,
          error: null,
          lastSaved: new Date(),
        });

        showUpdateIndicator(true);
      } catch (error) {
        console.error('Error saving links:', error);
        setSaveStatus({
          saving: false,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          lastSaved: null,
        });

        showUpdateIndicator(false);
      }
    },
    [artist, showUpdateIndicator, convertLinkItemsToDbFormat]
  );

  // Debounced save function
  const debouncedSave = useMemo(() => {
    const fn = (socialLinks: LinkItem[], dspLinks: LinkItem[]) => {
      saveLinks(socialLinks, dspLinks);
    };
    return debounce(fn as (...args: unknown[]) => void, 300);
  }, [saveLinks]);

  // Handle immediate save for new links (no debounce)
  const handleLinkAdded = useCallback(
    (newLinks: LinkItem[]) => {
      // Determine if this is social or DSP links and save immediately
      const isSocialLinks = newLinks.some(
        link => link.platform.category === 'social'
      );
      if (isSocialLinks) {
        saveLinks(newLinks, dspLinks);
      } else {
        saveLinks(socialLinks, newLinks);
      }
    },
    [socialLinks, dspLinks, saveLinks]
  );

  // Handle unified link changes with automatic categorization
  const handleAllLinksChange = (newLinks: LinkItem[]) => {
    // Separate links by category
    const newSocialLinks = newLinks.filter(
      link => link.platform.category === 'social'
    );
    const newDSPLinks = newLinks.filter(
      link => link.platform.category === 'dsp'
    );

    setSocialLinks(newSocialLinks);
    setDSPLinks(newDSPLinks);
    debouncedSave(newSocialLinks, newDSPLinks);
  };

  // Note: Profile switching functionality will be implemented in the future

  if (!artist) {
    return null; // Artist missing
  }

  return (
    <>
      {/* Main Edit Panel */}
      <div className='xl:pr-96'>
        <div className='mb-8'>
          <h1 className='text-2xl font-bold text-primary-token'>
            Manage Links
          </h1>
          <p className='text-secondary-token mt-1'>
            Add and manage your social and streaming links. Changes save
            automatically.
            {saveStatus.lastSaved && (
              <span className='ml-2 text-xs text-secondary-token'>
                Last saved: {saveStatus.lastSaved.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        {/* Links content */}
        <div className='space-y-6 relative pb-20'>
          {/* Update Indicator */}
          <div
            ref={updateIndicatorRef}
            className='fixed top-4 right-4 opacity-0 transition-all duration-500 data-[show=true]:opacity-100 data-[show=true]:translate-y-0 translate-y-2 z-50'
          />

          {/* Unified Link Manager with Magic Auto-Detection */}
          <UnifiedLinkManager
            initialLinks={initialAllLinks}
            onLinksChange={handleAllLinksChange}
            onLinkAdded={handleLinkAdded}
            disabled={saveStatus.saving}
          />
        </div>
      </div>

      {/* Preview Panel - Fixed aside on XL screens - Only show on links page */}
      <aside className='fixed inset-y-0 right-0 w-96 border-l border-subtle px-4 py-6 sm:px-6 lg:px-8 hidden xl:block bg-surface-0'>
        <DashboardPreview
          artist={previewArtist}
          socialLinksOverride={previewSocialLinks}
        />
      </aside>
    </>
  );
}
