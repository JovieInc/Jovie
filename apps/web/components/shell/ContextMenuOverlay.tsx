'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { SHORTCUTS } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import type {
  ContextMenuItem,
  ContextMenuItemAction,
  ContextMenuState,
} from './context-menu.types';

export interface ContextMenuOverlayProps {
  /**
   * Pointer coordinates + items to render. Pass `null` to unmount the
   * overlay; this is the canonical "menu closed" state.
   */
  readonly state: ContextMenuState | null;
  /** Called when the user dismisses the menu (Esc, click backdrop, item activation). */
  readonly onClose: () => void;
}

function isAction(item: ContextMenuItem): item is ContextMenuItemAction {
  return item.kind !== 'separator';
}

function resolveShortcut(
  shortcut: ContextMenuItemAction['shortcut']
): { keys: string } | null {
  if (!shortcut) return null;
  if (typeof shortcut === 'string') {
    if (shortcut in SHORTCUTS) {
      return SHORTCUTS[shortcut as keyof typeof SHORTCUTS];
    }
    return { keys: shortcut };
  }
  return null;
}

/**
 * ContextMenuOverlay — generic right-click / pointer-anchored context
 * menu. Render at the root of the page; pass `state` from a
 * `useState<ContextMenuState | null>` that captures pointer coords on
 * `contextmenu` events.
 *
 * The overlay clamps to viewport (flips up / left when the menu would
 * overflow), dismisses on backdrop click + Escape, and unifies its
 * chrome with `ShellDropdown` so click + right-click menus read as one
 * system.
 *
 * @example
 * ```tsx
 * const [menu, setMenu] = useState<ContextMenuState | null>(null);
 * <div onContextMenu={e => {
 *   e.preventDefault();
 *   setMenu({ x: e.clientX, y: e.clientY, items: [
 *     { label: 'Play', icon: Play, shortcut: 'playPause', onSelect: play },
 *     { kind: 'separator' },
 *     { label: 'Delete', tone: 'danger', onSelect: del },
 *   ]});
 * }}>
 *   …
 * </div>
 * <ContextMenuOverlay state={menu} onClose={() => setMenu(null)} />
 * ```
 */
export function ContextMenuOverlay({
  state,
  onClose,
}: ContextMenuOverlayProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });
  const groupId = useId();

  useEffect(() => {
    if (!state) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, onClose]);

  // Use layout effect so the clamp math runs before paint and the menu
  // never flashes at the un-clamped coordinate first.
  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    let left = state.x;
    let top = state.y;
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    setPos({ left, top });
  }, [state]);

  if (!state) return null;

  return (
    <div className='fixed inset-0 z-[60]'>
      <button
        type='button'
        aria-label='Close menu'
        tabIndex={-1}
        className='absolute inset-0 cursor-default'
        onClick={onClose}
        onContextMenu={e => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        role='menu'
        className='absolute min-w-[200px] max-w-[280px] rounded-xl border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.32)] p-1'
        style={{ left: pos.left, top: pos.top }}
      >
        {state.items.map((item, index) => {
          if (!isAction(item)) {
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: each menu state is rendered fresh; items array does not reorder mid-render
                key={`${groupId}-sep-${index}`}
                className='my-1 border-t border-(--linear-app-shell-border)/60'
                aria-hidden='true'
              />
            );
          }
          const Icon = item.icon;
          const sc = resolveShortcut(item.shortcut);
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: groupId+label disambiguates duplicate labels; items array does not reorder mid-render
              key={`${groupId}-item-${index}-${item.label}`}
              type='button'
              role='menuitem'
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                onClose();
              }}
              className={cn(
                'relative group/mi w-full flex items-center gap-2.5 h-7 px-2 rounded-md text-[12.5px] font-caption text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out',
                item.disabled
                  ? 'opacity-50 cursor-not-allowed text-secondary-token'
                  : item.tone === 'danger'
                    ? 'text-rose-300/90 hover:text-rose-200 hover:bg-rose-500/10'
                    : 'text-secondary-token hover:text-primary-token hover:bg-surface-1'
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    item.disabled
                      ? 'text-tertiary-token'
                      : item.tone === 'danger'
                        ? 'text-rose-300/70 group-hover/mi:text-rose-200'
                        : 'text-tertiary-token group-hover/mi:text-primary-token'
                  )}
                  strokeWidth={2.25}
                />
              )}
              <span className='flex-1 truncate'>{item.label}</span>
              {sc && (
                <kbd className='ml-auto inline-flex items-center h-4 min-w-4 px-1 rounded-[3px] text-[10px] font-caption uppercase tracking-[0.04em] text-tertiary-token bg-surface-0/80 border border-(--linear-app-shell-border)/60 leading-none'>
                  {sc.keys}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
