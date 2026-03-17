'use client';

/**
 * useDragAndDrop Hook
 *
 * Custom hook for managing drag-and-drop functionality for links.
 * Encapsulates dnd-kit specific logic including sensors, drag handlers,
 * cross-section validation, and hint messages for invalid moves.
 */

import {
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { canMoveTo, type LinkSection, labelFor, sectionOf } from '../utils';

/**
 * Options for the useDragAndDrop hook
 */
export interface UseDragAndDropOptions<T extends DetectedLink> {
  /** Current links array */
  links: T[];
  /** Callback when links are reordered */
  onLinksChange: (links: T[]) => void;
  /** Minimum distance (in pixels) to activate drag (default: 6) */
  activationDistance?: number;
  /** Duration in ms to show hint message (default: 2400) */
  hintDuration?: number;
}

/**
 * Return type for the useDragAndDrop hook
 */
export interface UseDragAndDropReturn<T extends DetectedLink> {
  /** dnd-kit sensors for pointer-based dragging */
  sensors: ReturnType<typeof useSensors>;
  /** Handler for drag end events with cross-section validation */
  onDragEnd: (event: DragEndEvent) => void;
  /** Current hint message for invalid drag operations */
  hint: string | null;
  /** Clear the hint message */
  clearHint: () => void;
  /** Set a custom hint message */
  setHint: (message: string | null) => void;
  /** Map of link IDs to their indices for efficient lookup */
  mapIdToIndex: Map<string, number>;
  /** Generate a stable ID for a link */
  idFor: (link: T) => string;
}

/**
 * Generate a stable ID for a link
 */
function createIdFor<T extends DetectedLink>(link: T): string {
  return `${link.platform.id}::${link.normalizedUrl || link.originalUrl || ''}`;
}

/**
 * Custom hook for managing drag-and-drop functionality.
 *
 * Features:
 * - Configurable pointer sensors with activation distance
 * - Cross-section drag validation
 * - Hint messages for invalid drag operations
 * - Stable link ID generation for dnd-kit
 * - Efficient ID-to-index mapping
 *
 * @example
 * ```tsx
 * const {
 *   sensors,
 *   onDragEnd,
 *   hint,
 *   mapIdToIndex,
 *   idFor,
 * } = useDragAndDrop({
 *   links,
 *   onLinksChange: setLinks,
 * });
 *
 * return (
 *   <DndContext sensors={sensors} onDragEnd={onDragEnd}>
 *     {hint && <div className="hint">{hint}</div>}
 *     <SortableContext items={links.map(idFor)}>
 *       {links.map(link => (
 *         <SortableItem key={idFor(link)} id={idFor(link)} />
 *       ))}
 *     </SortableContext>
 *   </DndContext>
 * );
 * ```
 */
export function useDragAndDrop<T extends DetectedLink = DetectedLink>({
  links,
  onLinksChange,
  activationDistance = 6,
  hintDuration = 2400,
}: UseDragAndDropOptions<T>): UseDragAndDropReturn<T> {
  // Hint state for showing error messages on invalid drag operations
  const [hint, setHint] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current != null) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    };
  }, []);

  // Pointer sensors with configurable activation distance
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: activationDistance },
    })
  );

  /**
   * Generate a stable ID for a link (memoized for consistent reference)
   */
  const idFor = useCallback((link: T): string => {
    return createIdFor(link);
  }, []);

  /**
   * Map of link IDs to their indices for efficient lookup during drag operations
   */
  const mapIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    links.forEach((l, idx) => {
      m.set(idFor(l), idx);
    });
    return m;
  }, [idFor, links]);

  /**
   * Clear the hint message
   */
  const clearHint = useCallback(() => {
    setHint(null);
  }, []);

  /**
   * Show a hint message with auto-clear after duration
   */
  const showHintWithTimeout = useCallback(
    (message: string) => {
      setHint(message);

      if (hintTimerRef.current != null) {
        clearTimeout(hintTimerRef.current);
      }

      hintTimerRef.current = setTimeout(() => {
        setHint(null);
        hintTimerRef.current = null;
      }, hintDuration);
    },
    [hintDuration]
  );

  /**
   * Handle drag end events with cross-section validation.
   *
   * - Same section reorders are always allowed
   * - Cross-section moves are validated using canMoveTo
   * - Invalid moves show a hint message
   * - Valid cross-section moves update the link's category
   */
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

      // Same section - just reorder
      if (fromSection === toSection) {
        const next = arrayMove(links, fromIdx, toIdx);
        onLinksChange(next);
        return;
      }

      // Cross-section move - validate using canMoveTo
      if (!canMoveTo(from, toSection)) {
        const platformName = from.platform.name || from.platform.id;
        const targetLabel = labelFor(toSection);
        showHintWithTimeout(
          `${platformName} can't be moved to ${targetLabel}. Only certain platforms (e.g., YouTube) can live in multiple sections.`
        );
        return;
      }

      // Valid cross-section move - update the link's category
      const next = [...links];
      const nextCategory = computeNextCategory(from, toSection);

      const updated = {
        ...from,
        platform: { ...from.platform, category: nextCategory },
      } as T;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, updated);
      onLinksChange(next);
    },
    [links, mapIdToIndex, onLinksChange, showHintWithTimeout]
  );

  return {
    sensors,
    onDragEnd,
    hint,
    clearHint,
    setHint,
    mapIdToIndex,
    idFor,
  };
}

/**
 * Compute the next category for a link being moved to a new section.
 *
 * For social/dsp/earnings sections, the category becomes the target section.
 * For custom section, we preserve the current category if it's already
 * a non-standard category (earnings, websites, custom).
 */
function computeNextCategory<T extends DetectedLink>(
  link: T,
  targetSection: LinkSection
): 'social' | 'dsp' | 'earnings' | 'websites' | 'custom' {
  if (
    targetSection === 'social' ||
    targetSection === 'dsp' ||
    targetSection === 'earnings'
  ) {
    return targetSection;
  }

  // For 'custom' section, preserve special categories
  const currentCategory = (link.platform.category ?? 'custom') as
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
}
