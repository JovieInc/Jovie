'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { PreviewPanelLink } from '@/app/app/dashboard/PreviewPanelContext';
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import type { LinkSection } from '@/components/dashboard/organisms/links/utils/link-categorization';
import { getPlatformCategory } from '@/components/dashboard/organisms/links/utils/platform-category';
import { cn } from '@/lib/utils';
import type { CategoryOption } from './ProfileLinkCategorySelector';

export interface ProfileLinkListProps {
  links: PreviewPanelLink[];
  selectedCategory: CategoryOption;
}

function compactUrlDisplay(platform: string, url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replaceAll(/(?:^\/+)|(?:\/+$)/g, '');
    if (pathname) {
      // Show handle/username if it looks like one
      if (pathname.startsWith('@')) {
        return pathname;
      }
      // For short paths, show as @handle style
      if (!pathname.includes('/') && pathname.length < 30) {
        return `@${pathname}`;
      }
    }
    // Fallback to hostname
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getLinkSection(platform: string): LinkSection {
  const category = getPlatformCategory(platform);
  return category === 'websites' ? 'custom' : (category as LinkSection);
}

const ACTION_BUTTON_CLASS =
  'p-1 rounded hover:bg-surface-2 text-tertiary-token hover:text-primary-token transition-colors ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token';

interface LinkItemProps {
  link: PreviewPanelLink;
}

function LinkItem({ link }: LinkItemProps) {
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
    window.open(link.url, '_blank', 'noopener,noreferrer');
  }, [link.url]);

  const displayText = compactUrlDisplay(link.platform, link.url);

  // Get platform brand color
  const iconMeta = getPlatformIcon(link.platform);
  const brandColor = iconMeta?.hex ? `#${iconMeta.hex}` : undefined;

  return (
    <div
      className={cn(
        'group flex items-center justify-between rounded-md py-1.5 px-1 -mx-1 hover:bg-surface-2/40 transition-colors ease-out',
        !link.isVisible && 'opacity-60'
      )}
    >
      {/* Left: Icon + Label */}
      <div className='flex items-center gap-2 min-w-0'>
        <span
          className='shrink-0'
          style={brandColor ? { color: brandColor } : undefined}
        >
          <SocialIcon platform={link.platform} className='h-4 w-4' />
        </span>
        <span className='text-sm text-primary-token truncate'>
          {displayText}
        </span>
      </div>

      {/* Right: Actions (visible on hover) */}
      <div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ease-out shrink-0'>
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
      </div>
    </div>
  );
}

export function ProfileLinkList({
  links,
  selectedCategory,
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

  return (
    <div className='space-y-0.5'>
      {filteredLinks.map(link => (
        <LinkItem key={link.id} link={link} />
      ))}
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
