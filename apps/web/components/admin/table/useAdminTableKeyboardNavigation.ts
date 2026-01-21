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

const FORM_ELEMENTS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return FORM_ELEMENTS.has(target.tagName);
}

function handleArrowNavigation(
  key: 'ArrowDown' | 'ArrowUp',
  selectedIndex: number,
  itemIds: string[],
  onSelect: (id: string | null) => void
): void {
  if (itemIds.length === 0) return;

  if (key === 'ArrowDown') {
    const nextIndex =
      selectedIndex === -1
        ? 0
        : Math.min(selectedIndex + 1, itemIds.length - 1);
    onSelect(itemIds[nextIndex] ?? null);
  } else if (key === 'ArrowUp') {
    const prevIndex =
      selectedIndex === -1
        ? itemIds.length - 1
        : Math.max(selectedIndex - 1, 0);
    onSelect(itemIds[prevIndex] ?? null);
  }
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

      const { key } = event;

      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        handleArrowNavigation(
          key as 'ArrowDown' | 'ArrowUp',
          selectedIndex,
          itemIds,
          onSelect
        );
        return;
      }

      if (key === ' ' || key === 'Spacebar') {
        if (!selectedId || !onToggleSidebar) return;
        event.preventDefault();
        onToggleSidebar();
        return;
      }

      if (key === 'Escape') {
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
