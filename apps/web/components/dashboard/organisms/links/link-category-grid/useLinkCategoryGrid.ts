'use client';

import type { DragEndEvent } from '@dnd-kit/core';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useMemo } from 'react';
import type { LinkPillMenuItem } from '@/components/dashboard/atoms/LinkPill';
import { popularityIndex } from '@/constants/app';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import {
  canMoveTo,
  groupLinks,
  type LinkSection,
  labelFor,
  sectionOf,
  suggestionIdentity,
} from '../utils';
import type { LinkCategoryGridProps } from './types';
import { idFor } from './utils';

interface UseLinkCategoryGridOptions<T extends DetectedLink>
  extends Pick<
    LinkCategoryGridProps<T>,
    | 'links'
    | 'onLinksChange'
    | 'onHint'
    | 'pendingPreview'
    | 'onAddPendingPreview'
    | 'onCancelPendingPreview'
  > {}

interface UseLinkCategoryGridReturn<T extends DetectedLink> {
  sensors: ReturnType<typeof useSensors>;
  sortedGroups: Record<LinkSection, T[]>;
  mapIdToIndex: Map<string, number>;
  onDragEnd: (ev: DragEndEvent) => void;
  buildSecondaryText: (
    link: Pick<DetectedLink, 'platform' | 'normalizedUrl'>
  ) => string | undefined;
  pendingPreviewMenuItems: LinkPillMenuItem[];
}

/**
 * Hook to manage LinkCategoryGrid state and handlers.
 */
export function useLinkCategoryGrid<T extends DetectedLink>({
  links,
  onLinksChange,
  onHint,
  pendingPreview,
  onAddPendingPreview,
  onCancelPendingPreview,
}: UseLinkCategoryGridOptions<T>): UseLinkCategoryGridReturn<T> {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const groups = useMemo(() => groupLinks(links), [links]);

  const sortedGroups = useMemo(() => {
    const sorted: Record<LinkSection, T[]> = {
      social: [],
      dsp: [],
      earnings: [],
      custom: [],
    };

    (['social', 'dsp', 'earnings', 'custom'] as const).forEach(section => {
      sorted[section] = groups[section]
        .slice()
        .sort(
          (a, b) =>
            popularityIndex(a.platform.id) - popularityIndex(b.platform.id)
        );
    });

    return sorted;
  }, [groups]);

  const mapIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l, idx) => {
      m.set(idFor(l), idx);
    });
    return m;
  }, [links]);

  const onDragEnd = useCallback(
    (ev: DragEndEvent) => {
      const { active, over } = ev;
      if (!over) return;
      if (active.id === over.id) return;

      const fromIdx = mapIdToIndex.get(String(active.id));
      const toIdx = mapIdToIndex.get(String(over.id));
      if (fromIdx == null || toIdx == null) return;

      const from = links[fromIdx];
      const to = links[toIdx];
      if (!from || !to) return;
      const fromSection = sectionOf(from);
      const toSection = sectionOf(to);

      if (fromSection === toSection) {
        const next = arrayMove(links, fromIdx, toIdx);
        onLinksChange(next);
        return;
      }

      if (!canMoveTo(from, toSection)) {
        const platformName = from.platform.name || from.platform.id;
        const targetLabel = labelFor(toSection);
        onHint(
          `${platformName} can't be moved to ${targetLabel}. Only certain platforms (e.g., YouTube) can live in multiple sections.`
        );
        setTimeout(() => onHint(null), 2400);
        return;
      }

      const next = [...links];
      const nextCategory = (() => {
        if (
          toSection === 'social' ||
          toSection === 'dsp' ||
          toSection === 'earnings'
        ) {
          return toSection;
        }
        const currentCategory = (from.platform.category ?? 'custom') as
          | 'social'
          | 'dsp'
          | 'earnings'
          | 'websites'
          | 'custom';
        if (
          currentCategory === 'earnings' ||
          currentCategory === 'websites' ||
          currentCategory === 'custom'
        ) {
          return currentCategory;
        }
        return 'custom';
      })();

      const updated = {
        ...from,
        platform: { ...from.platform, category: nextCategory },
      } as T;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, updated);
      onLinksChange(next);
    },
    [links, mapIdToIndex, onLinksChange, onHint]
  );

  const buildSecondaryText = useCallback(
    (link: Pick<DetectedLink, 'platform' | 'normalizedUrl'>) => {
      return suggestionIdentity(link);
    },
    []
  );

  const pendingPreviewMenuItems: LinkPillMenuItem[] = useMemo(
    () => [
      {
        id: 'add',
        label: 'Add',
        iconName: 'Plus',
        onSelect: () => {
          if (pendingPreview) {
            onAddPendingPreview(pendingPreview.link);
          }
        },
      },
      {
        id: 'cancel',
        label: 'Cancel',
        iconName: 'X',
        onSelect: () => {
          onCancelPendingPreview();
        },
      },
    ],
    [pendingPreview, onAddPendingPreview, onCancelPendingPreview]
  );

  return {
    sensors,
    sortedGroups,
    mapIdToIndex,
    onDragEnd,
    buildSecondaryText,
    pendingPreviewMenuItems,
  };
}
