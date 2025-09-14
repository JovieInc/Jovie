'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { DashboardData, ProfileSocialLink } from '@/app/dashboard/actions';
// flags import removed - pre-launch
import { debounce } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { getSocialPlatformLabel, type SocialPlatform } from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { GroupedLinksManager } from './GroupedLinksManager';

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

      // Properly capitalized display label for the platform
      const displayName = getSocialPlatformLabel(
        link.platform as SocialPlatform
      );

      return {
        id: link.id,
        title: displayName,
        platform: {
          id: link.platform,
          name: displayName,
          category: platformCategory,
          icon: link.platform,
          color: '#000000',
          placeholder: link.url,
        },
        normalizedUrl: link.url,
        originalUrl: link.url,
        suggestedTitle: displayName,
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
      // Persist ALL links. Visibility is reflected in isActive.
      return linkItems.map((link, index) => ({
        platform: link.platform.id,
        url: link.normalizedUrl,
        sortOrder: index,
        isActive: link.isVisible !== false,
      }));
    },
    []
  );

  // No client fetch; initial links are provided by the server via props

  // Convert current links to unified LinkItem format
  const initialAllLinks = useMemo(() => {
    return [...socialLinks, ...dspLinks].sort((a, b) => a.order - b.order);
  }, [socialLinks, dspLinks]);

  // Preview logic removed in favor of EnhancedDashboardLinks

  // Show update indicator
  const showUpdateIndicator = useCallback((success: boolean) => {
    if (updateIndicatorRef.current) {
      const el = updateIndicatorRef.current;
      el.dataset.show = 'true';
      // Safe alternative to innerHTML - use textContent to prevent XSS
      el.textContent = success ? '✅ Updated' : '❌ Error';
      // IMPORTANT: Don't overwrite base positioning/transition classes.
      // Only toggle variant styles to prevent layout shift.
      el.classList.remove('bg-green-500', 'bg-red-500');
      el.classList.add(
        success ? 'bg-green-500' : 'bg-red-500',
        'text-white',
        'px-3',
        'py-1',
        'rounded-full',
        'text-xs',
        'font-medium'
      );

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
      // Cancel any pending debounced save to avoid racing older payloads
      // debouncedSave exposes a cancel() method via our debounce helper
      if (
        typeof (debouncedSave as unknown as { cancel?: () => void }).cancel ===
        'function'
      ) {
        (debouncedSave as unknown as { cancel: () => void }).cancel();
      }
      if (isSocialLinks) {
        saveLinks(newLinks, dspLinks);
      } else {
        saveLinks(socialLinks, newLinks);
      }
    },
    [socialLinks, dspLinks, saveLinks, debouncedSave]
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

          {/* Grouped Links Manager (Immediate replacement of previous layout) */}
          <GroupedLinksManager
            initialLinks={initialAllLinks}
            onLinksChange={handleAllLinksChange}
            onLinkAdded={handleLinkAdded}
          />
        </div>
      </div>

      {/* Preview is handled by the EnhancedDashboardLinks component */}
    </>
  );
}
