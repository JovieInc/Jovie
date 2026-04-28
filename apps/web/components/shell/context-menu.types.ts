import type { ComponentType } from 'react';
import type { ShortcutKey } from '@/lib/shortcuts';

export interface ContextMenuItemAction {
  readonly kind?: 'item';
  readonly label: string;
  readonly icon?: ComponentType<{
    className?: string;
    strokeWidth?: number;
  }>;
  /**
   * Either a known `ShortcutKey` (resolved against `SHORTCUTS`) or a raw
   * keystroke string rendered verbatim in the trailing kbd chip.
   */
  readonly shortcut?: ShortcutKey | string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly tone?: 'default' | 'danger';
}

export interface ContextMenuSeparator {
  readonly kind: 'separator';
}

export type ContextMenuItem = ContextMenuItemAction | ContextMenuSeparator;

export interface ContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly items: readonly ContextMenuItem[];
}
