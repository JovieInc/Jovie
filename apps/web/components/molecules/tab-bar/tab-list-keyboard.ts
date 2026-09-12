import type { SegmentControlOption } from '@jovie/ui';
import type { KeyboardEvent } from 'react';

const TAB_NAV_KEYS = new Set([
  'ArrowRight',
  'ArrowLeft',
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
]);

export function nextTabValue<T extends string>(
  options: readonly SegmentControlOption<T>[],
  current: T,
  key: string
): T | null {
  const enabled = options
    .filter(option => !option.disabled)
    .map(option => option.value);
  if (enabled.length === 0) return null;

  const index = enabled.indexOf(current);
  const fallbackIndex = index < 0 ? 0 : index;

  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return enabled[(fallbackIndex + 1) % enabled.length] ?? null;
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return (
      enabled[(fallbackIndex - 1 + enabled.length) % enabled.length] ?? null
    );
  }
  if (key === 'Home') return enabled[0] ?? null;
  if (key === 'End') return enabled[enabled.length - 1] ?? null;
  return null;
}

export function handleTabListKeyDown<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  options: readonly SegmentControlOption<T>[],
  value: T,
  onValueChange: (value: T) => void
): void {
  if (!TAB_NAV_KEYS.has(event.key)) return;

  const next = nextTabValue(options, value, event.key);
  if (!next) return;

  event.preventDefault();
  onValueChange(next);

  const target = event.currentTarget.querySelector<HTMLElement>(
    `[role="tab"][data-testid="drawer-tab-${next}"]`
  );
  target?.focus();
}
