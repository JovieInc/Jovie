'use client';

import type React from 'react';
import { useCallback, useMemo } from 'react';

interface UseAdminTableKeyboardNavigationOptions<ItemType> {
  items: ItemType[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onToggleSidebar?: () => void;
  onCloseSidebar?: () => void;
  isSidebarOpen?: boolean;
  getId?: (item: ItemType) => string;
}

interface UseAdminTableKeyboardNavigationResult {
  selectedIndex: number;
  handleKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    tagName === 'BUTTON'
  );
}

export function useAdminTableKeyboardNavigation<ItemType>(
  options: UseAdminTableKeyboardNavigationOptions<ItemType>
): UseAdminTableKeyboardNavigationResult {
  const {
    items,
    selectedId,
    onSelect,
    onToggleSidebar,
    onCloseSidebar,
    isSidebarOpen,
    getId = (item: ItemType) => (item as { id: string }).id,
  } = options;

  const itemIds = useMemo(() => items.map(item => getId(item)), [getId, items]);

  const selectedIndex = useMemo(
    () => (selectedId ? itemIds.indexOf(selectedId) : -1),
    [itemIds, selectedId]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (isFormElement(event.target)) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (itemIds.length === 0) return;
        event.preventDefault();

        if (event.key === 'ArrowDown') {
          if (selectedIndex === -1) {
            onSelect(itemIds[0] ?? null);
          } else {
            const nextIndex = Math.min(selectedIndex + 1, itemIds.length - 1);
            onSelect(itemIds[nextIndex] ?? null);
          }
        } else if (event.key === 'ArrowUp') {
          if (selectedIndex === -1) {
            onSelect(itemIds[itemIds.length - 1] ?? null);
          } else {
            const previousIndex = Math.max(selectedIndex - 1, 0);
            onSelect(itemIds[previousIndex] ?? null);
          }
        }
      } else if (event.key === ' ' || event.key === 'Spacebar') {
        if (!selectedId || !onToggleSidebar) return;
        event.preventDefault();
        onToggleSidebar();
      } else if (event.key === 'Escape') {
        if (!isSidebarOpen || !onCloseSidebar) return;
        event.preventDefault();
        onCloseSidebar();
      }
    },
    [
      isSidebarOpen,
      itemIds,
      onCloseSidebar,
      onSelect,
      onToggleSidebar,
      selectedId,
      selectedIndex,
    ]
  );

  return { selectedIndex, handleKeyDown };
}
