'use client';

import React, { useCallback, useMemo } from 'react';

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

  const handleArrowNavigation = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, key: 'ArrowDown' | 'ArrowUp') => {
      if (itemIds.length === 0) return;
      event.preventDefault();

      const isDown = key === 'ArrowDown';
      if (selectedIndex === -1) {
        const targetIndex = isDown ? 0 : itemIds.length - 1;
        onSelect(itemIds[targetIndex] ?? null);
        return;
      }

      const nextIndex = isDown
        ? Math.min(selectedIndex + 1, itemIds.length - 1)
        : Math.max(selectedIndex - 1, 0);
      onSelect(itemIds[nextIndex] ?? null);
    },
    [itemIds, onSelect, selectedIndex]
  );

  const handleSpaceKey = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!selectedId || !onToggleSidebar) return;
      event.preventDefault();
      onToggleSidebar();
    },
    [onToggleSidebar, selectedId]
  );

  const handleEnterKey = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!selectedId) return;
      event.preventDefault();
      if (onActivate) {
        onActivate();
        return;
      }
      onToggleSidebar?.();
    },
    [onActivate, onToggleSidebar, selectedId]
  );

  const handleHomeEndNavigation = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, key: 'Home' | 'End') => {
      if (itemIds.length === 0) return;
      event.preventDefault();
      const targetIndex = key === 'Home' ? 0 : itemIds.length - 1;
      onSelect(itemIds[targetIndex] ?? null);
    },
    [itemIds, onSelect]
  );

  const handleEscapeKey = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!isSidebarOpen || !onCloseSidebar) return;
      event.preventDefault();
      onCloseSidebar();
    },
    [isSidebarOpen, onCloseSidebar]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (isFormElement(event.target)) return;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          handleArrowNavigation(event, event.key);
          break;
        case ' ':
        case 'Spacebar':
          handleSpaceKey(event);
          break;
        case 'Escape':
          handleEscapeKey(event);
          break;
        case 'Enter':
          handleEnterKey(event);
          break;
        case 'Home':
        case 'End':
          handleHomeEndNavigation(event, event.key);
          break;
      }
    },
    [
      handleArrowNavigation,
      handleEnterKey,
      handleEscapeKey,
      handleHomeEndNavigation,
      handleSpaceKey,
    ]
  );

  return { selectedIndex, handleKeyDown };
}
