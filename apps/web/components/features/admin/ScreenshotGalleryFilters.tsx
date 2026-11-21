'use client';

import { Button } from '@jovie/ui';
import {
  CANONICAL_SURFACES,
  type CanonicalSurfaceId,
} from '@/lib/canonical-surfaces';
import { GROUP_LABELS } from '@/lib/screenshots/registry';
import type {
  ScreenshotConsumer,
  ScreenshotGroup,
} from '@/lib/screenshots/types';

export type SurfaceFilter = 'all' | 'other' | CanonicalSurfaceId;

export const SURFACE_FILTERS: ReadonlyArray<{
  readonly id: SurfaceFilter;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Captures' },
  ...CANONICAL_SURFACES.map(surface => ({
    id: surface.id,
    label: surface.label,
  })),
  { id: 'other', label: 'Other Captures' },
] as const;

export const GROUP_FILTERS: ReadonlyArray<{
  readonly id: 'all' | ScreenshotGroup;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Groups' },
  ...Object.entries(GROUP_LABELS).map(([id, label]) => ({
    id: id as ScreenshotGroup,
    label,
  })),
] as const;

export const CONSUMER_FILTERS: ReadonlyArray<{
  readonly id: 'all' | ScreenshotConsumer;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Uses' },
  { id: 'marketing-export', label: 'Marketing Export' },
  { id: 'investor-ready', label: 'Investor Ready' },
] as const;

export function FilterChip({
  label,
  pressed,
  idleTone,
  onSelect,
}: Readonly<{
  label: string;
  pressed: boolean;
  idleTone: string;
  onSelect: () => void;
}>) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      onClick={onSelect}
      aria-pressed={pressed}
      className={`h-auto rounded-full border px-3 py-1.5 text-xs ${
        pressed
          ? 'border-(--linear-accent) bg-(--linear-accent)/10 text-primary-token'
          : `border-subtle ${idleTone} text-secondary-token`
      }`}
    >
      {label}
    </Button>
  );
}
