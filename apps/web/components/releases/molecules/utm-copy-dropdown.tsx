'use client';

/**
 * UTMCopyDropdown - Smart copy button with UTM preset selection
 *
 * Features:
 * - Simple copy button that expands into dropdown
 * - Quick presets organized by category with searchable submenus
 * - Smart sorting based on usage patterns
 * - Custom UTM builder access
 * - Toast feedback with URL preview
 *
 * This is the main entry point for UTM-tracked link copying.
 */

import {
  CommonDropdown,
  type CommonDropdownItem,
  SearchableSubmenu,
  type SearchableSubmenuSection,
} from '@jovie/ui';
import {
  Check,
  Copy,
  DollarSign,
  Link2,
  Mail,
  MoreHorizontal,
  Music,
  Settings,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import {
  buildUTMUrl,
  UTM_PRESET_CATEGORIES,
  UTM_PRESET_MAP,
  type UTMContext,
  type UTMPreset,
  useUTMSmartSort,
  useUTMUsageTracking,
} from '@/lib/utm';

// ============================================================================
// TYPES
// ============================================================================

export interface UTMCopyDropdownProps {
  /** The base URL to copy (smart link URL) */
  readonly url: string;
  /** Context for UTM parameter resolution */
  readonly context: UTMContext;
  /** Label for the release (shown in toast) */
  readonly releaseLabel: string;
  /** Test ID for the component */
  readonly testId?: string;
  /** Callback when copy succeeds */
  readonly onCopy?: (url: string, withUTM: boolean, presetId?: string) => void;
  /** Whether to stop event propagation */
  readonly stopPropagation?: boolean;
  /** Size variant */
  readonly size?: 'sm' | 'md';
  /** Additional class name */
  readonly className?: string;
}

// ============================================================================
// ICON MAP
// ============================================================================

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  social: <Share2 className='h-4 w-4' />,
  email: <Mail className='h-4 w-4' />,
  paid: <DollarSign className='h-4 w-4' />,
  music: <Music className='h-4 w-4' />,
  other: <MoreHorizontal className='h-4 w-4' />,
};

// ============================================================================
// COMPONENT
// ============================================================================

export function UTMCopyDropdown({
  url,
  context,
  releaseLabel,
  testId,
  onCopy,
  stopPropagation = false,
  size = 'sm',
  className,
}: UTMCopyDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const openTimeRef = useRef<number>(0);

  // Usage tracking for smart sorting
  const { trackPresetUsage } = useUTMUsageTracking({
    contextId: context.releaseSlug,
    enableAnalytics: true,
  });

  // Smart sorted presets
  const { recent, popular } = useUTMSmartSort({
    categories: UTM_PRESET_CATEGORIES,
    maxRecent: 3,
    maxPopular: 5,
  });

  // Handle dropdown open
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        openTimeRef.current = Date.now();
        track('utm_dropdown_open', {
          releaseId: context.releaseSlug,
          source: 'copy_button',
        });
      }
    },
    [context.releaseSlug]
  );

  // Copy URL to clipboard
  const copyToClipboard = useCallback(
    async (
      urlToCopy: string,
      withUTM: boolean,
      presetId?: string,
      presetLabel?: string
    ) => {
      try {
        await navigator.clipboard.writeText(urlToCopy);

        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);

        // Show toast with feedback
        const toastMessage = withUTM
          ? `${releaseLabel} copied with ${presetLabel} UTM`
          : `${releaseLabel} smart link copied`;

        toast.success(toastMessage, {
          id: testId || 'utm-copy',
          description: withUTM
            ? 'Link includes tracking parameters'
            : undefined,
        });

        onCopy?.(urlToCopy, withUTM, presetId);
        setIsOpen(false);
      } catch (error) {
        console.error('Failed to copy:', error);
        toast.error('Failed to copy to clipboard');
      }
    },
    [releaseLabel, testId, onCopy]
  );

  // Handle preset selection
  const handlePresetSelect = useCallback(
    (preset: UTMPreset, position: number, wasSearched = false) => {
      const result = buildUTMUrl({
        url,
        params: preset.params,
        context,
      });

      // Track usage for smart sorting
      trackPresetUsage(preset.id, {
        category: UTM_PRESET_MAP[preset.id]
          ? UTM_PRESET_CATEGORIES.find(c =>
              c.presets.some(p => p.id === preset.id)
            )?.id
          : undefined,
        wasSearched,
        position,
        timeToSelect: Date.now() - openTimeRef.current,
      });

      copyToClipboard(result.url, true, preset.id, preset.label);
    },
    [url, context, trackPresetUsage, copyToClipboard]
  );

  // Handle plain copy (no UTM)
  const handlePlainCopy = useCallback(() => {
    copyToClipboard(url, false);
  }, [url, copyToClipboard]);

  // Build searchable sections for each category submenu
  const buildCategorySections = useCallback(
    (categoryId: string): SearchableSubmenuSection[] => {
      const category = UTM_PRESET_CATEGORIES.find(c => c.id === categoryId);
      if (!category) return [];

      // Check if we have any recent/popular items for this category
      const categoryPresetIds = new Set(category.presets.map(p => p.id));
      const categoryRecent = recent.filter(p => categoryPresetIds.has(p.id));
      const categoryPopular = popular.filter(p => categoryPresetIds.has(p.id));

      const sections: SearchableSubmenuSection[] = [];

      // Add recent section if we have any
      if (categoryRecent.length > 0) {
        sections.push({
          id: 'recent',
          label: 'Recent',
          items: categoryRecent.map(preset => ({
            id: preset.id,
            label: preset.label,
            description: preset.description,
          })),
        });
      }

      // Add popular section if we have any (and they're not in recent)
      const recentIds = new Set(categoryRecent.map(p => p.id));
      const filteredPopular = categoryPopular.filter(p => !recentIds.has(p.id));
      if (filteredPopular.length > 0) {
        sections.push({
          id: 'popular',
          label: 'Popular',
          items: filteredPopular.map(preset => ({
            id: preset.id,
            label: preset.label,
            description: preset.description,
          })),
        });
      }

      // Add all items section
      const usedIds = new Set([
        ...categoryRecent.map(p => p.id),
        ...filteredPopular.map(p => p.id),
      ]);
      const remaining = category.presets.filter(p => !usedIds.has(p.id));

      if (remaining.length > 0 || sections.length === 0) {
        sections.push({
          id: 'all',
          label: sections.length > 0 ? 'All' : category.label,
          items: (sections.length > 0 ? remaining : category.presets).map(
            preset => ({
              id: preset.id,
              label: preset.label,
              description: preset.description,
            })
          ),
        });
      }

      return sections;
    },
    [recent, popular]
  );

  // Build dropdown items
  const dropdownItems = useMemo((): CommonDropdownItem[] => {
    const items: CommonDropdownItem[] = [];

    // Plain copy option
    items.push({
      type: 'action',
      id: 'copy-plain',
      label: 'Copy Link',
      icon: Link2,
      subText: 'No tracking',
      onClick: handlePlainCopy,
    });

    items.push({
      type: 'separator',
      id: 'sep-1',
    });

    items.push({
      type: 'label',
      id: 'label-utm',
      label: 'Copy with UTM',
    });

    // Quick presets section (recent + popular combined)
    const quickPresets = [
      ...recent,
      ...popular.filter(p => !recent.some(r => r.id === p.id)),
    ].slice(0, 5);

    if (quickPresets.length > 0) {
      for (const preset of quickPresets) {
        const position = quickPresets.indexOf(preset);
        items.push({
          type: 'action',
          id: `quick-${preset.id}`,
          label: preset.label,
          icon: Sparkles,
          onClick: () => handlePresetSelect(preset, position, false),
        });
      }

      items.push({
        type: 'separator',
        id: 'sep-2',
      });
    }

    // Category submenus
    for (const category of UTM_PRESET_CATEGORIES) {
      items.push({
        type: 'custom',
        id: `category-${category.id}`,
        render: () => (
          <SearchableSubmenu
            key={category.id}
            triggerLabel={category.label}
            triggerIcon={CATEGORY_ICONS[category.id]}
            sections={buildCategorySections(category.id)}
            onSelect={item => {
              const preset = UTM_PRESET_MAP[item.id];
              if (preset) {
                handlePresetSelect(preset, 0, true);
              }
            }}
            searchPlaceholder={`Search ${category.label.toLowerCase()}...`}
            emptyMessage='No presets found'
          />
        ),
      });
    }

    items.push({
      type: 'separator',
      id: 'sep-3',
    });

    // Custom UTM option
    items.push({
      type: 'action',
      id: 'custom-utm',
      label: 'Custom UTM...',
      icon: Settings,
      onClick: () => {
        track('utm_custom_open', {});
        // TODO: Open custom UTM builder modal
        toast.info('Custom UTM builder coming soon!');
      },
    });

    return items;
  }, [
    handlePlainCopy,
    recent,
    popular,
    handlePresetSelect,
    buildCategorySections,
  ]);

  // Trigger button content
  const triggerButton = (
    <button
      type='button'
      className={`inline-flex items-center justify-center rounded-md p-1.5 text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className || ''}`}
      onClick={e => {
        if (stopPropagation) e.stopPropagation();
      }}
      title='Copy link'
    >
      <span className='relative flex h-4 w-4 items-center justify-center'>
        <Copy
          className={`absolute h-4 w-4 transition-all duration-150 ${
            isCopied ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
          }`}
        />
        <Check
          className={`absolute h-4 w-4 text-green-500 transition-all duration-150 ${
            isCopied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
      </span>
    </button>
  );

  return (
    <span data-testid={testId} className='inline-flex'>
      <CommonDropdown
        variant='dropdown'
        trigger={triggerButton}
        items={dropdownItems}
        open={isOpen}
        onOpenChange={handleOpenChange}
        align='end'
        side='bottom'
        sideOffset={4}
        aria-label='Copy link options'
      />
    </span>
  );
}
