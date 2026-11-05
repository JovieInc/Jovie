import type { Decorator } from '@storybook/nextjs-vite';
import { createElement, type KeyboardEvent } from 'react';
import type { EntityRailActivityItem } from './ActivityFeed';
import type { RightDrawerProps } from './RightDrawer';

export function drawerStoryFrame(className: string, dir?: 'rtl'): Decorator {
  const DrawerStoryFrame: Decorator = Story =>
    createElement('div', { className, dir }, createElement(Story));
  return DrawerStoryFrame;
}

export const MockRightDrawer = (
  props: RightDrawerProps & { 'data-testid'?: string }
) =>
  createElement(
    'aside',
    {
      id: props.id,
      'data-testid': props['data-testid'] ?? 'right-drawer',
      'aria-label': props.ariaLabel,
      style: { width: props.width },
      onKeyDown: (event: KeyboardEvent) => props.onKeyDown?.(event.nativeEvent),
    },
    props.children
  );

// A fixed clock in ActivityFeed.test.tsx keeps calendar groups deterministic.
export const ACTIVITY_ITEMS: readonly EntityRailActivityItem[] = [
  ['Tim White', 'edited', 'Midnight Drive', '2026-01-15T01:05:00Z'],
  ['Jovie', 'linked', 'Spotify', '2026-01-15T09:00:00Z'],
  ['Maya Vale', 'approved', 'Tour poster', '2026-01-14T18:30:00Z'],
  ['Jovie', 'published', 'Lost in the Light', '2026-01-13T08:00:00Z'],
].map(([actor, verb, object, at], index) => ({
  id: String(index),
  actor,
  verb,
  object,
  at,
}));
