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
export type GroupFilter = 'all' | ScreenshotGroup;
export type ConsumerFilter = 'all' | ScreenshotConsumer;

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
  readonly id: GroupFilter;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Groups' },
  ...Object.entries(GROUP_LABELS).map(([id, label]) => ({
    id: id as ScreenshotGroup,
    label,
  })),
] as const;

export const CONSUMER_FILTERS: ReadonlyArray<{
  readonly id: ConsumerFilter;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Uses' },
  { id: 'marketing-export', label: 'Marketing Export' },
  { id: 'investor-ready', label: 'Investor Ready' },
] as const;

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatCaptureDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

export type DisplayScreenshotConsumer = Exclude<ScreenshotConsumer, 'admin'>;

export function isDisplayConsumer(
  consumer: ScreenshotConsumer
): consumer is DisplayScreenshotConsumer {
  return consumer !== 'admin';
}

export function formatConsumerLabel(consumer: DisplayScreenshotConsumer) {
  switch (consumer) {
    case 'marketing-export':
      return 'Marketing Export';
    case 'investor-ready':
      return 'Investor Ready';
  }
}
