'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { DashboardData, ProfileSocialLink } from '@/app/dashboard/actions';
import { debounce } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { getSocialPlatformLabel, type SocialPlatform } from '@/types';
import {
  type Artist,
  convertDrizzleCreatorProfileToArtist,
  type LegacySocialLink,
} from '@/types/db';
import { EnhancedDashboardLayout } from './EnhancedDashboardLayout';
import { ProfilePreview } from '@/components/dashboard/molecules/ProfilePreview';
import { Button } from '@/components/ui/Button';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

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
  const getPlatformCategory = (platform: string): 'social' | 'dsp' | 'custom' => {
    const dspPlatforms = new Set([
      'spotify', 'apple_music', 'youtube_music', 'soundcloud',
      'bandcamp', 'tidal', 'deezer', 'amazon_music', 'pandora'
    ]);

    const socialPlatforms = new Set([
      'instagram', 'twitter', 'tiktok', 'youtube', 
      'facebook', 'twitch', 'shopify', 'etsy', 'amazon', 
      'patreon', 'buy_me_a_coffee', 'kofi', 'paypal', 'venmo', 'cashapp'
    ]);

    if (dspPlatforms.has(platform)) return 'dsp';
    if (socialPlatforms.has(platform)) return 'social';
    return 'custom';
  };

  // Convert database social links to LinkItem format
  const convertDbLinksToLinkItems = useCallback((dbLinks: ProfileSocialLink[] = []): LinkItem[] => {
    return dbLinks.map((link, index) => {
      const displayName = getSocialPlatformLabel(link.platform as SocialPlatform);
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
  }, []);

  // Initialize links from server props
  const [links, setLinks] = useState<LinkItem[]>(() => {
    return convertDbLinksToLinkItems(initialLinks || []);
  });

  // Convert to legacy format for preview
  const previewSocialLinks = useMemo((): LegacySocialLink[] => {
    return links
      .filter(link => link.isVisible && link.category === 'social')
      .map(link => ({
        id: link.id,
        artist_id: artist?.id || '',
        platform: link.platform.icon,
        url: link.normalizedUrl,
        clicks: 0,
        created_at: new Date().toISOString(),
      }));
  }, [links, artist]);

  // Create preview artist object
  const previewArtist = useMemo((): Artist | null => {
    if (!artist) return null;
    return {
      ...artist,
      // Apply any real-time changes here
    };
  }, [artist]);

  // Save links to database
  const saveLinks = useCallback(debounce(async (...args: unknown[]) => {
    // Safely cast the first argument to an array of any
    const linksToSave = Array.isArray(args[0]) ? args[0] : [];
    // Convert back to our internal LinkItem type if needed
    const internalLinks = linksToSave.map(link => {
      if ('platform' in link && typeof link.platform === 'string') {
        // This is coming from EnhancedDashboardLayout
        return {
          ...link,
          platform: {
            id: link.platform,
            name: link.title || 'Custom Link',
            category: link.category === 'music' ? 'dsp' : 
                     link.category === 'social' ? 'social' : 'custom',
            icon: link.platform,
            color: '#000000',
            placeholder: 'https://example.com',
          },
          normalizedUrl: link.url,
          originalUrl: link.url,
          suggestedTitle: link.title,
          isValid: true,
        };
      }
      return link;
    });
    try {
      setSaveStatus(prev => ({ ...prev, saving: true }));
      
      const payload = linksToSave.map((link, index) => ({
        platform: link.platform.id,
        url: link.normalizedUrl,
        sortOrder: index,
        isActive: link.isVisible !== false,
        displayText: link.title,
      }));

      const response = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ links: payload }),
      });

      if (!response.ok) {
        throw new Error('Failed to save links');
      }

      const data = await response.json();
      
      // Update local state with server response
      const updatedLinks = data.links.map((link: any, index: number) => {
        const existing = linksToSave.find(l => l.normalizedUrl === link.url);
        return {
          ...existing!,
          id: link.id,
          order: index,
        };
      });

      setLinks(updatedLinks);
      
      setSaveStatus({
        saving: false,
        success: true,
        error: null,
        lastSaved: new Date(),
      });
      
      toast.success('Links saved successfully');
      
    } catch (error) {
      console.error('Error saving links:', error);
      
      setSaveStatus({
        saving: false,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save links',
        lastSaved: null,
      });
      
      toast.error('Failed to save links. Please try again.');
    }
  }, 500), []);

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
    saveLinks(updatedLinks);
  }, [links, saveLinks]);

  // Handle editing a link
  const handleEditLink = useCallback((id: string) => {
    // In a real implementation, this would open an edit modal or form
    console.log('Edit link:', id);
    toast.info('Edit link functionality will be implemented in the next phase');
  }, []);

  // Handle deleting a link
  const handleDeleteLink = useCallback((id: string) => {
    const updatedLinks = links.filter(link => link.id !== id);
    setLinks(updatedLinks);
    saveLinks(updatedLinks);
    toast.success('Link removed');
  }, [links, saveLinks]);

  // Handle toggling link visibility
  const handleToggleVisibility = useCallback((id: string) => {
    const updatedLinks = links.map(link => 
      link.id === id ? { ...link, isVisible: !link.isVisible } : link
    );
    setLinks(updatedLinks);
    saveLinks(updatedLinks);
  }, [links, saveLinks]);

  // Handle reordering links
  const handleReorderLinks = useCallback((items: any[]) => {
    // Convert back to our internal LinkItem type if needed
    const reorderedLinks = items.map(item => {
      if ('platform' in item && typeof item.platform === 'string') {
        // This is coming from EnhancedDashboardLayout
        return {
          ...item,
          platform: {
            id: item.platform,
            name: item.title || 'Custom Link',
            category: item.category === 'music' ? 'dsp' : 
                     item.category === 'social' ? 'social' : 'custom',
            icon: item.platform,
            color: '#000000',
            placeholder: 'https://example.com',
          },
          normalizedUrl: item.url,
          originalUrl: item.url,
          suggestedTitle: item.title,
          isValid: true,
        };
      }
      return item;
    });
    
    setLinks(reorderedLinks);
    saveLinks(reorderedLinks);
  }, [saveLinks]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.PointerEvent, id: string) => {
    // Implementation for drag start
  }, []);

  // Get username and avatar for preview
  const username = artist?.name || 'username';
  const avatarUrl = artist?.image_url || null;

  // Convert links to the format expected by EnhancedDashboardLayout
  const dashboardLinks = useMemo(() => links.map(link => {
    // Map our internal category type to the expected category type in EnhancedDashboardLayout
    const mapCategory = (category: 'social' | 'dsp' | 'custom'): 'social' | 'music' | 'commerce' | 'other' | undefined => {
      switch (category) {
        case 'dsp': return 'music';
        case 'social': return 'social';
        case 'custom': return 'other';
        default: return undefined;
      }
    };

    return {
      id: link.id,
      title: link.title,
      url: link.normalizedUrl,
      platform: link.platform.id as 'instagram' | 'twitter' | 'tiktok' | 'youtube' | 'spotify' | 'applemusic' | 'custom',
      isVisible: link.isVisible,
      category: mapCategory(link.category)
    };
  }), [links]);

  // Prepare links for the phone preview component
  const previewLinks = useMemo(() => links
    .filter(link => link.isVisible)
    .map(link => ({
      id: link.id,
      title: link.title,
      url: link.normalizedUrl,
      platform: link.platform.id,
      isVisible: link.isVisible,
    })), [links]);

  const profilePath = `/${artist?.handle || 'username'}`;

  return (
    <div className='grid grid-cols-1 xl:grid-cols-[1fr_24rem] gap-6'>
      <div className='w-full'>
        <EnhancedDashboardLayout
          username={username}
          avatarUrl={avatarUrl}
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
              <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>Live Preview</h2>
              <div className='text-sm text-gray-500 dark:text-gray-400'>
                Updates in real-time
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
            <h3 className='text-sm font-medium text-gray-900 dark:text-white mb-3'>Your Profile URL</h3>
            <div className='flex flex-col sm:flex-row gap-2'>
              <div className='flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 font-mono truncate'>
                {typeof window !== 'undefined' 
                  ? `${window.location.origin}${profilePath}`
                  : 'Loading...'}
              </div>
              <div className='flex gap-2'>
                <CopyToClipboardButton relativePath={profilePath} idleLabel='Copy' successLabel='Copied!' />
                <Button
                  as={Link}
                  href={profilePath}
                  target='_blank'
                  rel='noopener noreferrer'
                  variant='outline'
                  size='sm'
                  className='shrink-0 flex-1 sm:flex-initial whitespace-nowrap'
                >
                  <ArrowTopRightOnSquareIcon className='h-4 w-4 mr-1.5' />
                  Open
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
