'use client';

import { useSession } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { flags } from '@/lib/env';
import { debounce } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import {
  type Artist,
  convertDrizzleCreatorProfileToArtist,
  type LegacySocialLink,
  type SocialLink,
  type SocialPlatform,
} from '@/types/db';
import { UnifiedLinkManager } from './molecules/UnifiedLinkManager';

interface LinkItem extends DetectedLink {
  id: string;
  title: string;
  isVisible: boolean;
  order: number;
}

interface DashboardLinksProps {
  initialData: DashboardData;
}

interface SaveStatus {
  saving: boolean;
  success: boolean | null;
  error: string | null;
  lastSaved: Date | null;
}

export function DashboardLinks({ initialData }: DashboardLinksProps) {
  const { session } = useSession();
  const [artist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );
  const [socialLinks, setSocialLinks] = useState<LinkItem[]>([]);
  const [dspLinks, setDSPLinks] = useState<LinkItem[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    saving: false,
    success: null,
    error: null,
    lastSaved: null,
  });
  const updateIndicatorRef = useRef<HTMLDivElement>(null);

  // Convert database social links to LinkItem format
  const convertDbLinksToLinkItems = (
    dbLinks: SocialLink[] | LegacySocialLink[] = []
  ): LinkItem[] => {
    return dbLinks.map((link, index) => {
      // Determine platform category based on platform name
      const platformCategory = [
        'spotify',
        'apple_music',
        'youtube_music',
        'soundcloud',
        'bandcamp',
        'tidal',
        'deezer',
      ].includes(link.platform)
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
        isVisible: true,
        order: index,
      };
    });
  };

  // Convert LinkItems to database format
  const convertLinkItemsToDbFormat = (
    linkItems: LinkItem[],
    creatorProfileId: string
  ) => {
    return linkItems
      .filter(link => link.isVisible)
      .map((link, index) => ({
        creatorProfileId: creatorProfileId,
        platform: link.platform.id,
        platformType: link.platform.id as SocialPlatform,
        url: link.normalizedUrl,
        sortOrder: index,
        isActive: true,
      }));
  };

  // Initialize links from database
  useEffect(() => {
    const fetchLinks = async () => {
      if (!session || !artist?.id) return;

      try {
        const res = await fetch(
          `/api/dashboard/social-links?profileId=${encodeURIComponent(artist.id)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error(`Failed to fetch links (${res.status})`);
        const json: { links: SocialLink[] } = await res.json();

        // Split links into social and DSP categories
        const socialLinksItems: LinkItem[] = [];
        const dspLinksItems: LinkItem[] = [];

        const allLinks = convertDbLinksToLinkItems(json.links || []);

        allLinks.forEach(link => {
          if (link.platform.category === 'dsp') {
            dspLinksItems.push(link);
          } else {
            socialLinksItems.push(link);
          }
        });

        setSocialLinks(socialLinksItems);
        setDSPLinks(dspLinksItems);
      } catch (error) {
        console.error('Error initializing links:', error);
      }
    };

    fetchLinks();
  }, [session, artist?.id]);

  // Convert current links to unified LinkItem format
  const initialAllLinks = useMemo(() => {
    return [...socialLinks, ...dspLinks].sort((a, b) => a.order - b.order);
  }, [socialLinks, dspLinks]);

  // Show update indicator
  const showUpdateIndicator = useCallback((success: boolean) => {
    if (updateIndicatorRef.current) {
      updateIndicatorRef.current.dataset.show = 'true';
      updateIndicatorRef.current.innerHTML = success
        ? '<div class="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium">Updated</div>'
        : '<div class="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-medium">Error</div>';

      setTimeout(() => {
        if (updateIndicatorRef.current) {
          updateIndicatorRef.current.dataset.show = 'false';
        }
      }, 2000);
    }
  }, []);

  // Save links to database
  const saveLinks = useCallback(
    async (socialLinksToSave: LinkItem[], dspLinksToSave: LinkItem[]) => {
      if (!session || !artist?.id) return;

      setSaveStatus(prev => ({
        ...prev,
        saving: true,
        success: null,
        error: null,
      }));

      try {
        // Convert links to database format for API payload
        const allLinks = [
          ...convertLinkItemsToDbFormat(socialLinksToSave, artist.id),
          ...convertLinkItemsToDbFormat(dspLinksToSave, artist.id),
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
    [session, artist, showUpdateIndicator]
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

  if (!artist || !flags.feature_social_links) {
    return null; // Feature disabled or artist missing
  }

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Manage Links</h1>
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
      <div className='space-y-6 relative'>
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
  );
}
