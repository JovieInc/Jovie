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

interface DispatchContext {
  event: React.KeyboardEvent<HTMLElement>;
  itemIds: string[];
  selectedIndex: number;
  selectedId: string | null;
  navigateTo: (event: React.KeyboardEvent<HTMLElement>, index: number) => void;
  onActivate?: () => void;
  onToggleSidebar?: () => void;
  onCloseSidebar?: () => void;
  isSidebarOpen?: boolean;
}

function handleNavNext(ctx: DispatchContext): boolean {
  if (ctx.itemIds.length === 0) return false;
  const next =
    ctx.selectedIndex === -1
      ? 0
      : Math.min(ctx.selectedIndex + 1, ctx.itemIds.length - 1);
  ctx.navigateTo(ctx.event, next);
  return true;
}

function handleNavPrev(ctx: DispatchContext): boolean {
  if (ctx.itemIds.length === 0) return false;
  const prev =
    ctx.selectedIndex === -1
      ? ctx.itemIds.length - 1
      : Math.max(ctx.selectedIndex - 1, 0);
  ctx.navigateTo(ctx.event, prev);
  return true;
}

function handleNavEdge(ctx: DispatchContext, edge: 'first' | 'last'): boolean {
  if (ctx.itemIds.length === 0) return false;
  ctx.navigateTo(ctx.event, edge === 'first' ? 0 : ctx.itemIds.length - 1);
  return true;
}

function handleActivateAction(ctx: DispatchContext): boolean {
  if (!ctx.selectedId) return false;
  ctx.event.preventDefault();
  if (ctx.onActivate) ctx.onActivate();
  else ctx.onToggleSidebar?.();
  return true;
}

function handleToggleAction(ctx: DispatchContext): boolean {
  if (!ctx.selectedId || !ctx.onToggleSidebar) return false;
  ctx.event.preventDefault();
  ctx.onToggleSidebar();
  return true;
}

function handleCloseAction(ctx: DispatchContext): boolean {
  if (!ctx.isSidebarOpen || !ctx.onCloseSidebar) return false;
  ctx.event.preventDefault();
  ctx.onCloseSidebar();
  return true;
}

function dispatchTableNavAction(action: string, ctx: DispatchContext): boolean {
  switch (action) {
    case 'next':
      return handleNavNext(ctx);
    case 'prev':
      return handleNavPrev(ctx);
    case 'first':
      return handleNavEdge(ctx, 'first');
    case 'last':
      return handleNavEdge(ctx, 'last');
    case 'activate':
      return handleActivateAction(ctx);
    case 'toggle':
      return handleToggleAction(ctx);
    case 'close':
      return handleCloseAction(ctx);
    default:
      return false;
  }
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

      dispatchTableNavAction(action, {
        event,
        itemIds,
        selectedIndex,
        selectedId,
        navigateTo,
        onActivate,
        onToggleSidebar,
        onCloseSidebar,
        isSidebarOpen,
      });
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
