'use client';

import { SimpleTooltip } from '@jovie/ui';
import { useMemo } from 'react';
import { toast } from 'sonner';
import type {
  PreviewPanelData,
  PreviewPanelLink,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/components/dashboard/atoms/DspProviderIcon';
import type { LinkSection } from '@/components/dashboard/organisms/links/utils/link-categorization';
import { getPlatformCategory } from '@/components/dashboard/organisms/links/utils/platform-category';
import {
  DrawerLinkSection,
  SidebarLinkRow,
} from '@/components/molecules/drawer';
import { extractHandleFromUrl } from '@/lib/utils/social-platform';

export type CategoryOption = LinkSection | 'all';

type PreviewDspConnections = PreviewPanelData['dspConnections'];

export interface ProfileLinkListProps {
  readonly links: PreviewPanelLink[];
  readonly selectedCategory: CategoryOption;
  readonly onAddLink?: (category: LinkSection) => void;
  readonly onRemoveLink?: (linkId: string) => void;
  readonly dspConnections?: PreviewDspConnections;
}

function getLinkSection(platform: string): LinkSection {
  const category = getPlatformCategory(platform);
  return category === 'websites' ? 'custom' : (category as LinkSection);
}

/**
 * Safely extract a display hostname from a URL string.
 * Returns the hostname without 'www.' prefix, or the raw URL if parsing fails.
 */
function formatDisplayHost(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

const SECTION_ORDER: LinkSection[] = ['social', 'dsp', 'earnings', 'custom'];

const SECTION_LABELS: Record<LinkSection, string> = {
  social: 'Social',
  dsp: 'Music',
  earnings: 'Earnings',
  custom: 'Web',
};

interface LinkItemProps {
  readonly link: PreviewPanelLink;
  readonly onRemove?: (linkId: string) => void;
}

function LinkItem({ link, onRemove }: LinkItemProps) {
  const handle = extractHandleFromUrl(link.url);

  const trailingContent =
    link.platform === 'website' && link.verificationStatus === 'verified' ? (
      <span className='ml-0.5 inline-flex align-middle'>
        <SimpleTooltip content='Official website'>
          <span>
            <VerifiedBadge size='sm' className='text-accent' />
          </span>
        </SimpleTooltip>
      </span>
    ) : undefined;

  return (
    <SidebarLinkRow
      icon={<SocialIcon platform={link.platform} className='h-4 w-4' />}
      label={handle ? `@${handle}` : formatDisplayHost(link.url)}
      url={link.url}
      deepLinkPlatform={link.platform}
      isVisible={link.isVisible}
      trailingContent={trailingContent}
      isEditable={Boolean(onRemove)}
      onRemove={onRemove ? () => onRemove(link.id) : undefined}
      onCopySuccess={() => toast.success('Link copied')}
      onCopyError={() => toast.error('Failed to copy')}
    />
  );
}

function ConnectedDspRows({
  dspConnections,
}: {
  readonly dspConnections: PreviewDspConnections;
}) {
  const connectedProviders = [
    {
      provider: 'spotify' as const,
      connected: dspConnections.spotify.connected,
      artistName: dspConnections.spotify.artistName,
    },
    {
      provider: 'apple_music' as const,
      connected: dspConnections.appleMusic.connected,
      artistName: dspConnections.appleMusic.artistName,
    },
  ].filter(provider => provider.connected);

  if (connectedProviders.length === 0) {
    return (
      <p className='text-sm text-secondary-token'>
        No music platforms connected yet
      </p>
    );
  }

  return (
    <div className='space-y-0.5'>
      {connectedProviders.map(provider => (
        <div
          key={provider.provider}
          className='flex items-center gap-2.5 px-3 py-1.5 lg:rounded-md hover:bg-interactive-hover transition-colors'
        >
          <span className='shrink-0 w-5 flex items-center justify-center'>
            <DspProviderIcon provider={provider.provider} size='sm' />
          </span>
          <span className='text-xs text-secondary-token truncate'>
            {provider.artistName || PROVIDER_LABELS[provider.provider]}
          </span>
          <span className='text-[10px] text-tertiary-token shrink-0'>
            Connected
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProfileLinkList({
  links,
  selectedCategory,
  onAddLink,
  onRemoveLink,
  dspConnections,
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

  // When viewing a specific category, use shared DrawerLinkSection
  if (selectedCategory !== 'all') {
    if (selectedCategory === 'dsp' && dspConnections) {
      return (
        <DrawerLinkSection
          title='Music links'
          onAdd={onAddLink ? () => onAddLink(selectedCategory) : undefined}
          addLabel='Add Music link'
          isEmpty={
            filteredLinks.length === 0 &&
            !dspConnections.spotify.connected &&
            !dspConnections.appleMusic.connected
          }
          emptyMessage='No music links yet. Click + to add one.'
        >
          <div className='space-y-0.5'>
            <ConnectedDspRows dspConnections={dspConnections} />
            {filteredLinks.map(link => (
              <LinkItem key={link.id} link={link} onRemove={onRemoveLink} />
            ))}
          </div>
        </DrawerLinkSection>
      );
    }

    return (
      <DrawerLinkSection
        title={`${SECTION_LABELS[selectedCategory]} links`}
        onAdd={onAddLink ? () => onAddLink(selectedCategory) : undefined}
        addLabel={`Add ${SECTION_LABELS[selectedCategory]} link`}
        isEmpty={filteredLinks.length === 0}
        emptyMessage={`No ${SECTION_LABELS[selectedCategory].toLowerCase()} links yet. Click + to add one.`}
      >
        <div className='space-y-2'>
          {filteredLinks.map(link => (
            <LinkItem key={link.id} link={link} onRemove={onRemoveLink} />
          ))}
        </div>
      </DrawerLinkSection>
    );
  }

  // When viewing all, group by section using shared DrawerLinkSection
  return (
    <div className='space-y-6'>
      {SECTION_ORDER.map(section => {
        const sectionLinks = groupedLinks[section];
        if (sectionLinks.length === 0) return null;

        return (
          <DrawerLinkSection
            key={section}
            title={`${SECTION_LABELS[section]} links`}
            onAdd={onAddLink ? () => onAddLink(section) : undefined}
            addLabel={`Add ${SECTION_LABELS[section]} link`}
          >
            <div className='space-y-2'>
              {sectionLinks.map(link => (
                <LinkItem key={link.id} link={link} onRemove={onRemoveLink} />
              ))}
            </div>
          </DrawerLinkSection>
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
