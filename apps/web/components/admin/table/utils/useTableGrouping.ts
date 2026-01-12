'use client';

import { useEffect, useRef, useState } from 'react';

interface UseTableGroupingOptions<T> {
  /**
   * Data rows to group
   */
  data: T[];

  /**
   * Function to get the group key from a row
   */
  getGroupKey: (row: T) => string;

  /**
   * Function to get the group label from a key
   */
  getGroupLabel: (key: string) => string;

  /**
   * Whether grouping is enabled
   */
  enabled: boolean;
}

interface GroupedData<T> {
  key: string;
  label: string;
  rows: T[];
  count: number;
}

/**
 * useTableGrouping - Hook for grouping table rows with sticky headers
 *
 * Features:
 * - Groups rows by a field
 * - Provides grouped data structure
 * - Handles sticky header behavior with Intersection Observer
 * - Smart disappearing: current header fades when next reaches top
 *
 * Example:
 * ```tsx
 * const { groupedData, observeGroupHeader } = useTableGrouping({
 *   data: entries,
 *   getGroupKey: (entry) => entry.status,
 *   getGroupLabel: (key) => key.charAt(0).toUpperCase() + key.slice(1),
 *   enabled: groupingEnabled,
 * });
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

  // Group the data
  const groupedData: GroupedData<T>[] = enabled
    ? Object.entries(
        data.reduce(
          (groups, row) => {
            const key = getGroupKey(row);
            if (!groups[key]) {
              groups[key] = [];
            }
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
      }))
    : [];

  // Set up Intersection Observer for sticky header behavior
  useEffect(() => {
    if (!enabled || groupedData.length === 0) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer
    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.boundingClientRect.top <= 0) {
            // Header is at the top - update visible index
            const key = entry.target.getAttribute('data-group-key');
            const index = groupedData.findIndex(g => g.key === key);
            if (index !== -1) {
              setVisibleGroupIndex(index);
            }
          }
        });
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
