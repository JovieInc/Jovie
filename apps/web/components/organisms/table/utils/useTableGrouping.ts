'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Configuration options for the useTableGrouping hook
 * @typeParam T - The type of data rows being grouped
 */
interface UseTableGroupingOptions<T> {
  /**
   * Array of data rows to group
   */
  data: T[];

  /**
   * Function to extract the group key from each row.
   * Used to determine which group a row belongs to.
   * @param row - The data row
   * @returns Group key as a string (e.g., 'new', 'invited', 'claimed')
   * @example
   * getGroupKey: (entry) => entry.status
   */
  getGroupKey: (row: T) => string;

  /**
   * Function to convert group key into a human-readable label.
   * @param key - The group key
   * @returns Display label for the group (e.g., 'New Applications')
   * @example
   * getGroupLabel: (key) => key.charAt(0).toUpperCase() + key.slice(1)
   */
  getGroupLabel: (key: string) => string;

  /**
   * Whether grouping is enabled. If false, returns empty grouped data.
   */
  enabled: boolean;
}

/**
 * Data structure representing a group of rows
 * @typeParam T - The type of data rows in the group
 */
interface GroupedData<T> {
  /** Unique identifier for this group */
  key: string;
  /** Human-readable display label */
  label: string;
  /** Array of rows belonging to this group */
  rows: T[];
  /** Number of rows in this group */
  count: number;
}

/**
 * useTableGrouping - Hook for grouping table rows with sticky headers
 *
 * **Algorithm**: Uses a reduce operation to group rows by their group key in O(n) time,
 * where n is the number of rows. Groups maintain insertion order of first appearance.
 *
 * **Sticky Header Behavior**: Uses IntersectionObserver to track when group headers reach
 * the top of their scroll container. When a header becomes "stuck" at the top
 * (isIntersecting && boundingClientRect.top <= 0), we update visibleGroupIndex to track
 * which group is currently visible. This enables smart header transitions where the current
 * sticky header can fade out when the next group's header approaches.
 *
 * **Performance**: The grouping operation runs on every render when data changes. For large
 * datasets (1000+ rows), consider memoizing the data array or using useMemo for the grouped result.
 *
 * Features:
 * - Groups rows by a field in O(n) time
 * - Provides structured grouped data with counts
 * - Handles sticky header behavior with Intersection Observer
 * - Smart header transitions: current header fades when next reaches top
 * - Automatic cleanup of observers on unmount
 *
 * @typeParam T - The type of data rows being grouped
 * @param options - Configuration options for grouping
 * @returns Object containing grouped data, visibility state, and observer registration function
 *
 * @example
 * ```tsx
 * const { groupedData, observeGroupHeader, visibleGroupIndex } = useTableGrouping({
 *   data: entries,
 *   getGroupKey: (entry) => entry.status,
 *   getGroupLabel: (key) => key.charAt(0).toUpperCase() + key.slice(1),
 *   enabled: groupingEnabled,
 * });
 *
 * // Render grouped data
 * {groupedData.map((group, groupIndex) => (
 *   <div key={group.key}>
 *     <div
 *       ref={(el) => observeGroupHeader(group.key, el)}
 *       data-group-key={group.key}
 *       className={visibleGroupIndex === groupIndex ? 'fade-out' : ''}
 *     >
 *       {group.label} ({group.count})
 *     </div>
 *     {group.rows.map(row => <Row key={row.id} data={row} />)}
 *   </div>
 * ))}
 * ```
 */
export function useTableGrouping<T>({
  data,
  getGroupKey,
  getGroupLabel,
  enabled,
}: UseTableGroupingOptions<T>) {
  const [visibleGroupIndex, setVisibleGroupIndex] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const headerRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Group the data using reduce operation
  // Algorithm: O(n) time complexity where n = number of rows
  // 1. Reduce data array into a Record<groupKey, T[]>
  // 2. Convert Record to array of GroupedData objects
  // 3. Preserve insertion order (first appearance of each group key)
  // Memoized to prevent useEffect from running on every render
  const groupedData: GroupedData<T>[] = useMemo(() => {
    if (!enabled) return [];

    return Object.entries(
      data.reduce(
        (groups, row) => {
          const key = getGroupKey(row);
          // Initialize empty array for new group keys
          if (!groups[key]) {
            groups[key] = [];
          }
          // Add row to its group
          groups[key].push(row);
          return groups;
        },
        {} as Record<string, T[]>
      )
    ).map(([key, rows]) => ({
      key,
      label: getGroupLabel(key),
      rows,
      count: rows.length,
    }));
  }, [enabled, data, getGroupKey, getGroupLabel]);

  // Handle intersection entry for sticky header tracking
  const handleIntersectionEntry = (
    entry: IntersectionObserverEntry,
    groups: GroupedData<T>[]
  ) => {
    if (!entry.isIntersecting || entry.boundingClientRect.top > 0) return;

    // Use .dataset API instead of getAttribute for cleaner access
    const key = (entry.target as HTMLElement).dataset.groupKey;
    if (!key) return;

    const index = groups.findIndex(g => g.key === key);
    if (index !== -1) {
      setVisibleGroupIndex(index);
    }
  };

  // Set up Intersection Observer for sticky header behavior
  useEffect(() => {
    if (!enabled || groupedData.length === 0) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer with extracted handler to reduce nesting
    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => handleIntersectionEntry(entry, groupedData));
      },
      {
        threshold: [0, 1],
        rootMargin: '-1px 0px 0px 0px',
      }
    );

    // Observe all group headers
    headerRefs.current.forEach(header => {
      if (observerRef.current) {
        observerRef.current.observe(header);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enabled, groupedData]);

  // Function to register a group header for observation
  const observeGroupHeader = (key: string, element: HTMLElement | null) => {
    if (!element) {
      headerRefs.current.delete(key);
      return;
    }

    headerRefs.current.set(key, element);

    if (observerRef.current) {
      observerRef.current.observe(element);
    }
  };

  return {
    groupedData,
    visibleGroupIndex,
    observeGroupHeader,
    isGroupingEnabled: enabled,
  };
}
