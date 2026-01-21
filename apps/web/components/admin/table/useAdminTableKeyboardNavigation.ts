'use client';

import React, { useCallback, useMemo } from 'react';

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

function getNextIndex(
  selectedIndex: number,
  itemCount: number,
  direction: 'down' | 'up'
): number {
  if (direction === 'down') {
    return selectedIndex === -1
      ? 0
      : Math.min(selectedIndex + 1, itemCount - 1);
  }
  return selectedIndex === -1 ? itemCount - 1 : Math.max(selectedIndex - 1, 0);
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

      const key = event.key;
      const isArrowKey = key === 'ArrowDown' || key === 'ArrowUp';
      const isSpaceKey = key === ' ' || key === 'Spacebar';
      const isEscapeKey = key === 'Escape';

      if (isArrowKey && itemIds.length > 0) {
        event.preventDefault();
        const direction = key === 'ArrowDown' ? 'down' : 'up';
        const nextIndex = getNextIndex(
          selectedIndex,
          itemIds.length,
          direction
        );
        onSelect(itemIds[nextIndex] ?? null);
        return;
      }

      if (isSpaceKey && selectedId && onToggleSidebar) {
        event.preventDefault();
        onToggleSidebar();
        return;
      }

      if (isEscapeKey && isSidebarOpen && onCloseSidebar) {
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
