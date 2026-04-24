'use client';

import { SimpleTooltip } from '@jovie/ui';
import * as Sentry from '@sentry/nextjs';
import { useMemo } from 'react';
import { toast } from 'sonner';
import type {
  PreviewPanelData,
  PreviewPanelLink,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import { LINEAR_SURFACE } from '@/components/features/dashboard/tokens';
import {
  DrawerLinkSection,
  SidebarLinkRow,
} from '@/components/molecules/drawer';
import { PLATFORM_METADATA_MAP } from '@/constants/platforms';
import { PROVIDER_LABELS } from '@/features/dashboard/atoms/DspProviderIcon';
import type { LinkSection } from '@/features/dashboard/organisms/links/utils/link-categorization';
import { getPlatformCategory } from '@/features/dashboard/organisms/links/utils/platform-category';
import { cn } from '@/lib/utils';
import { extractHandleFromUrl } from '@/lib/utils/social-platform';
import { SuggestedDspMatches } from './SuggestedDspMatches';

export type CategoryOption = LinkSection | 'all';

type PreviewDspConnections = PreviewPanelData['dspConnections'];

export interface ProfileLinkListProps {
  readonly links: PreviewPanelLink[];
  readonly selectedCategory: CategoryOption;
  readonly onAddLink?: (category: LinkSection) => void;
  readonly onRemoveLink?: (linkId: string) => void;
  readonly dspConnections?: PreviewDspConnections;
  readonly onDisconnectDsp?: (provider: 'spotify' | 'apple_music') => void;
  readonly surface?: 'card' | 'plain';
  readonly profileId?: string;
}

function mapPreviewCategoryToSection(
  category: PreviewPanelLink['category']
): LinkSection | null {
  if (category === 'social') return 'social';
  if (category === 'music') return 'dsp';
  if (category === 'commerce') return 'earnings';
  if (category === 'other') return 'custom';
  return null;
}

function getLinkSection(link: PreviewPanelLink): LinkSection {
  const fromCategory = mapPreviewCategoryToSection(link.category);
  if (fromCategory) return fromCategory;

  if (link.platformType) {
    if (link.platformType === 'websites') return 'custom';
    if (VALID_SECTIONS.has(link.platformType))
      return link.platformType as LinkSection;
    Sentry.addBreadcrumb({
      category: 'links',
      message: `Unknown platformType: ${link.platformType}`,
      level: 'warning',
    });
    return 'custom';
  }

  const category = getPlatformCategory(link.platform);
  if (category === 'websites') return 'custom';
  if (VALID_SECTIONS.has(category)) return category as LinkSection;
  return 'custom';
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

/** Valid LinkSection values for runtime validation of free-text DB platformType */
const VALID_SECTIONS: ReadonlySet<string> = new Set(SECTION_ORDER);

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
      label={
        handle
          ? `@${handle}`
          : (PLATFORM_METADATA_MAP[link.platform]?.name ??
            formatDisplayHost(link.url))
      }
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
  onDisconnect,
}: {
  readonly dspConnections: PreviewDspConnections;
  readonly onDisconnect?: (provider: 'spotify' | 'apple_music') => void;
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
  ].filter(entry => entry.connected);

  if (connectedProviders.length === 0) {
    return (
      <p className='text-app text-secondary-token'>
        No artist profiles connected yet
      </p>
    );
  }

  return (
    <div className='space-y-0.5'>
      {connectedProviders.map(entry => (
        <SidebarLinkRow
          key={entry.provider}
          icon={<SocialIcon platform={entry.provider} className='h-4 w-4' />}
          label={entry.artistName || PROVIDER_LABELS[entry.provider]}
          url=''
          deepLinkPlatform={entry.provider}
          trailingContent={
            <span
              className='ml-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-success'
              title='Connected'
            />
          }
          isEditable={Boolean(onDisconnect)}
          onRemove={
            onDisconnect ? () => onDisconnect(entry.provider) : undefined
          }
        />
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
  onDisconnectDsp,
  surface = 'card',
  profileId,
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
      const section = getLinkSection(link);
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

  // When viewing a specific category, render links directly (no section header —
  // the tab already labels the category, and the + button is inline with tabs)
  if (selectedCategory !== 'all') {
    const sectionSurfaceClassName =
      surface === 'card' ? LINEAR_SURFACE.drawerCard : '';

    if (selectedCategory === 'dsp' && dspConnections) {
      const hasDspContent =
        filteredLinks.length > 0 ||
        dspConnections.spotify.connected ||
        dspConnections.appleMusic.connected;

      // When profileId is present, always render the section so
      // SuggestedDspMatches can show even when nothing is connected yet.
      if (!hasDspContent && !profileId) {
        return (
          <div className={cn(sectionSurfaceClassName, 'px-3 py-3')}>
            <p className='py-1 text-xs text-tertiary-token'>
              No music links yet. Click + to add one.
            </p>
          </div>
        );
      }

      return (
        <div className={cn(sectionSurfaceClassName, 'space-y-1 p-2')}>
          <ConnectedDspRows
            dspConnections={dspConnections}
            onDisconnect={onDisconnectDsp}
          />
          {filteredLinks.map(link => (
            <LinkItem key={link.id} link={link} onRemove={onRemoveLink} />
          ))}
          {profileId && <SuggestedDspMatches profileId={profileId} />}
        </div>
      );
    }

    if (filteredLinks.length === 0) {
      return (
        <div className={cn(sectionSurfaceClassName, 'px-3 py-3')}>
          <p className='py-1 text-xs text-tertiary-token'>
            No {SECTION_LABELS[selectedCategory].toLowerCase()} links yet. Click
            + to add one.
          </p>
        </div>
      );
    }

    return (
      <div className={cn(sectionSurfaceClassName, 'space-y-1 p-2')}>
        {filteredLinks.map(link => (
          <LinkItem key={link.id} link={link} onRemove={onRemoveLink} />
        ))}
      </div>
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
            <div className='space-y-0.5'>
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
    const section = getLinkSection(link);
    counts[section]++;
  }

  return counts;
}
