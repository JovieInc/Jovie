'use client';

import { Copy, ExternalLink } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { PreviewPanelLink } from '@/app/app/dashboard/PreviewPanelContext';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import type { LinkSection } from '@/components/dashboard/organisms/links/utils/link-categorization';
import { getPlatformCategory } from '@/components/dashboard/organisms/links/utils/platform-category';
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

interface LinkItemProps {
  link: PreviewPanelLink;
}

function LinkItem({ link }: LinkItemProps) {
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success('Link copied');
    } catch {
      toast.error('Failed to copy');
    }
  }, [link.url]);

  const handleOpen = useCallback(() => {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  }, [link.url]);

  return (
    <div className='group flex items-center justify-between rounded-md py-1.5 px-1 -mx-1 hover:bg-surface-2/40 transition-colors'>
      <div className='flex-1 min-w-0'>
        <PlatformPill
          platformIcon={link.platform}
          platformName={link.title}
          primaryText={compactUrlDisplay(link.platform, link.url)}
          collapsed={false}
          tone={link.isVisible ? 'default' : 'faded'}
        />
      </div>
      <div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'>
        <button
          type='button'
          onClick={handleCopy}
          className='p-1.5 rounded-md text-tertiary-token hover:text-primary-token hover:bg-surface-2/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-1'
          aria-label='Copy link'
        >
          <Copy className='h-3.5 w-3.5' />
        </button>
        <button
          type='button'
          onClick={handleOpen}
          className='p-1.5 rounded-md text-tertiary-token hover:text-primary-token hover:bg-surface-2/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-1'
          aria-label='Open in new tab'
        >
          <ExternalLink className='h-3.5 w-3.5' />
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
