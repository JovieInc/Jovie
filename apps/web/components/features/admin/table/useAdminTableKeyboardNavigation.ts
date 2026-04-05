'use client';

import React, { useCallback, useMemo } from 'react';
import { resolveTableNavAction } from '@/components/organisms/table/utils/tableKeyMap';

interface UseAdminTableKeyboardNavigationOptions<ItemType> {
  items: ItemType[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onToggleSidebar?: () => void;
  onActivate?: () => void;
  onCloseSidebar?: () => void;
  isSidebarOpen?: boolean;
  getId?: (item: ItemType) => string;
}

interface UseAdminTableKeyboardNavigationResult {
  selectedIndex: number;
  handleKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

/**
 * Container-level keyboard navigation for admin tables with sidebar.
 *
 * Uses the shared tableKeyMap for consistent key bindings.
 * Adds sidebar-aware behaviour (Space toggles, Escape closes).
 */
export function useAdminTableKeyboardNavigation<ItemType>(
  options: UseAdminTableKeyboardNavigationOptions<ItemType>
): UseAdminTableKeyboardNavigationResult {
  const {
    items,
    selectedId,
    onSelect,
    onToggleSidebar,
    onActivate,
    onCloseSidebar,
    isSidebarOpen,
    getId = (item: ItemType) => (item as { id: string }).id,
  } = options;

  const itemIds = useMemo(() => items.map(item => getId(item)), [getId, items]);

  const selectedIndex = useMemo(
    () => (selectedId ? itemIds.indexOf(selectedId) : -1),
    [itemIds, selectedId]
  );

  const navigateTo = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, targetIndex: number) => {
      event.preventDefault();
      onSelect(itemIds[targetIndex] ?? null);
    },
    [itemIds, onSelect]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const action = resolveTableNavAction(event.key, event.target);
      if (!action) return;

      switch (action) {
        case 'next': {
          if (itemIds.length === 0) return;
          const next =
            selectedIndex === -1
              ? 0
              : Math.min(selectedIndex + 1, itemIds.length - 1);
          navigateTo(event, next);
          break;
        }

        case 'prev': {
          if (itemIds.length === 0) return;
          const prev =
            selectedIndex === -1
              ? itemIds.length - 1
              : Math.max(selectedIndex - 1, 0);
          navigateTo(event, prev);
          break;
        }

        case 'first':
          if (itemIds.length === 0) return;
          navigateTo(event, 0);
          break;

        case 'last':
          if (itemIds.length === 0) return;
          navigateTo(event, itemIds.length - 1);
          break;

        case 'activate':
          if (!selectedId) return;
          event.preventDefault();
          if (onActivate) {
            onActivate();
          } else {
            onToggleSidebar?.();
          }
          break;

        case 'toggle':
          if (!selectedId || !onToggleSidebar) return;
          event.preventDefault();
          onToggleSidebar();
          break;

        case 'close':
          if (!isSidebarOpen || !onCloseSidebar) return;
          event.preventDefault();
          onCloseSidebar();
          break;
      }
    },
    [
      itemIds,
      navigateTo,
      selectedId,
      selectedIndex,
      onActivate,
      onToggleSidebar,
      onCloseSidebar,
      isSidebarOpen,
    ]
  );

  return { selectedIndex, handleKeyDown };
}
