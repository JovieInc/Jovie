'use client';

import { Check, Copy, ExternalLink, Plus, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { SwipeToReveal } from '@/components/atoms/SwipeToReveal';
import type { LinkSection } from '@/components/dashboard/organisms/links/utils/link-categorization';
import { getPlatformCategory } from '@/components/dashboard/organisms/links/utils/platform-category';
import { cn } from '@/lib/utils';
import { getContrastSafeIconColor } from '@/lib/utils/color';
import type { CategoryOption } from './ProfileLinkCategorySelector';

export interface ProfileLinkListProps {
  readonly links: PreviewPanelLink[];
  readonly selectedCategory: CategoryOption;
  readonly onAddLink?: (category: LinkSection) => void;
  readonly onRemoveLink?: (linkId: string) => void;
}

function getLinkSection(platform: string): LinkSection {
  const category = getPlatformCategory(platform);
  return category === 'websites' ? 'custom' : (category as LinkSection);
}

const ACTION_BUTTON_CLASS =
  'p-1.5 rounded-md text-secondary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token';

const SWIPE_ACTION_CLASS =
  'flex h-full items-center justify-center px-4 text-white transition-colors active:opacity-80';

const SECTION_ORDER: LinkSection[] = ['social', 'dsp', 'earnings', 'custom'];

const SECTION_LABELS: Record<LinkSection, string> = {
  social: 'Social',
  dsp: 'Music',
  earnings: 'Earnings',
  custom: 'Web',
};

/**
 * Display labels for platforms with special casing requirements
 */
const PLATFORM_DISPLAY_LABELS: Record<string, string> = {
  youtube_music: 'YouTube Music',
  youtubemusic: 'YouTube Music',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  apple_music: 'Apple Music',
  amazon_music: 'Amazon Music',
  dsp: 'DSP',
};

function formatPlatformName(platform: string): string {
  const lower = platform.toLowerCase();
  if (PLATFORM_DISPLAY_LABELS[lower]) {
    return PLATFORM_DISPLAY_LABELS[lower];
  }
  // Fallback: capitalize first letter for unknown platforms
  return platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
}

interface LinkItemProps {
  readonly link: PreviewPanelLink;
  readonly onRemove?: (linkId: string) => void;
}

function LinkItem({ link, onRemove }: LinkItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Failed to copy');
    }
  }, [link.url]);

  const handleOpen = useCallback(() => {
    globalThis.open(link.url, '_blank', 'noopener,noreferrer');
  }, [link.url]);

  const handleRemove = useCallback(() => {
    onRemove?.(link.id);
  }, [link.id, onRemove]);

  const platformName = formatPlatformName(link.platform);

  // Get platform brand color
  const iconMeta = getPlatformIconMetadata(link.platform);
  const brandColor = iconMeta?.hex ? `#${iconMeta.hex}` : undefined;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const swipeActionsWidth = onRemove ? 132 : 88;

  const swipeActions = (
    <>
      <button
        type='button'
        onClick={handleCopy}
        className={cn(SWIPE_ACTION_CLASS, 'bg-blue-500')}
        aria-label={copied ? 'Copied!' : `Copy ${link.title} link`}
      >
        {copied ? (
          <Check className='h-4 w-4' aria-hidden='true' />
        ) : (
          <Copy className='h-4 w-4' aria-hidden='true' />
        )}
      </button>
      <button
        type='button'
        onClick={handleOpen}
        className={cn(SWIPE_ACTION_CLASS, 'bg-gray-500')}
        aria-label={`Open ${link.title}`}
      >
        <ExternalLink className='h-4 w-4' aria-hidden='true' />
      </button>
      {onRemove && (
        <button
          type='button'
          onClick={handleRemove}
          className={cn(SWIPE_ACTION_CLASS, 'bg-red-500')}
          aria-label={`Remove ${link.title}`}
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </button>
      )}
    </>
  );

  return (
    <SwipeToReveal
      itemId={`profile-link-${link.id}`}
      actions={swipeActions}
      actionsWidth={swipeActionsWidth}
      className='rounded-xl'
    >
      <div
        className={cn(
          'flex items-center justify-between rounded-xl px-3 py-2.5 bg-base transition-colors ease-out hover:bg-surface-2',
          !link.isVisible && 'opacity-60'
        )}
      >
        {/* Left: Icon + Platform Name */}
        <div className='flex items-center gap-3 min-w-0'>
          <span
            className='shrink-0'
            style={
              brandColor
                ? { color: getContrastSafeIconColor(brandColor, isDark) }
                : undefined
            }
          >
            <SocialIcon platform={link.platform} className='h-4 w-4' />
          </span>
          <span className='text-sm font-medium text-primary-token truncate'>
            {platformName}
          </span>
        </div>

        {/* Right: Actions (visible on hover/focus - desktop only) */}
        <div className='hidden sm:flex items-center gap-1 shrink-0'>
          <button
            type='button'
            onClick={handleOpen}
            className={ACTION_BUTTON_CLASS}
            aria-label={`Open ${link.title}`}
          >
            <ExternalLink className='h-4 w-4' aria-hidden='true' />
          </button>
          <button
            type='button'
            onClick={handleCopy}
            className={ACTION_BUTTON_CLASS}
            aria-label={copied ? 'Copied!' : `Copy ${link.title} link`}
          >
            {copied ? (
              <Check className='h-4 w-4 text-success' aria-hidden='true' />
            ) : (
              <Copy className='h-4 w-4' aria-hidden='true' />
            )}
          </button>
          {onRemove && (
            <button
              type='button'
              onClick={handleRemove}
              className={ACTION_BUTTON_CLASS}
              aria-label={`Remove ${link.title}`}
            >
              <X className='h-4 w-4' aria-hidden='true' />
            </button>
          )}
        </div>
      </div>
    </SwipeToReveal>
  );
}

interface SectionHeaderProps {
  readonly section: LinkSection;
  readonly onAdd?: (section: LinkSection) => void;
}

function SectionHeader({ section, onAdd }: SectionHeaderProps) {
  return (
    <div className='flex items-center justify-between mb-2'>
      <h4 className='text-xs font-medium text-secondary-token'>
        {SECTION_LABELS[section]} links
      </h4>
      {onAdd && (
        <button
          type='button'
          onClick={() => onAdd(section)}
          className='p-1 rounded hover:bg-surface-2 text-secondary-token hover:text-primary-token transition-colors'
          aria-label={`Add ${SECTION_LABELS[section]} link`}
        >
          <Plus className='h-4 w-4' />
        </button>
      )}
    </div>
  );
}

export function ProfileLinkList({
  links,
  selectedCategory,
  onAddLink,
  onRemoveLink,
}: ProfileLinkListProps) {
  // Group links by category
  const groupedLinks = useMemo(() => {
    const groups: Record<LinkSection, PreviewPanelLink[]> = {
      social: [],
      dsp: [],
      earnings: [],
      custom: [],
    };

    for (const link of links) {
      const section = getLinkSection(link.platform);
      groups[section].push(link);
    }

    return groups;
  }, [links]);

  // Get filtered links based on selected category
  const filteredLinks = useMemo(() => {
    if (selectedCategory === 'all') {
      return links;
    }
    return groupedLinks[selectedCategory] ?? [];
  }, [selectedCategory, groupedLinks, links]);

  if (filteredLinks.length === 0) {
    return (
      <div className='py-8 text-center'>
        <p className='text-sm text-secondary-token'>
          No links in this category
        </p>
      </div>
    );
  }

  // When viewing a specific category, show section header
  if (selectedCategory !== 'all') {
    return (
      <div className='space-y-3'>
        <SectionHeader section={selectedCategory} onAdd={onAddLink} />
        <div className='space-y-2'>
          {filteredLinks.map(link => (
            <LinkItem key={link.id} link={link} onRemove={onRemoveLink} />
          ))}
        </div>
      </div>
    );
  }

  // When viewing all, group by section
  return (
    <div className='space-y-6'>
      {SECTION_ORDER.map(section => {
        const sectionLinks = groupedLinks[section];
        if (sectionLinks.length === 0) return null;

        return (
          <div key={section} className='space-y-3'>
            <SectionHeader section={section} onAdd={onAddLink} />
            <div className='space-y-2'>
              {sectionLinks.map(link => (
                <LinkItem key={link.id} link={link} onRemove={onRemoveLink} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Export helper for getting category counts
export function getCategoryCounts(
  links: PreviewPanelLink[]
): Record<CategoryOption, number> {
  const counts: Record<CategoryOption, number> = {
    all: links.length,
    social: 0,
    dsp: 0,
    earnings: 0,
    custom: 0,
  };

  for (const link of links) {
    const section = getLinkSection(link.platform);
    counts[section]++;
  }

  return counts;
}
