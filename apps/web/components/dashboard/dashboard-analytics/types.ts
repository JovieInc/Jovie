import type { AnalyticsRange } from '@/types/analytics';

export type Range = Extract<AnalyticsRange, '1d' | '7d' | '30d'>;

export interface RangeOption {
  label: string;
  value: Range;
}

export interface RangeToggleProps {
  readonly value: Range;
  readonly onChange: (v: Range) => void;
  readonly tabsBaseId: string;
  readonly panelId: string;
}

export const RANGE_OPTIONS: readonly RangeOption[] = [
  { label: '1d', value: '1d' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
] as const;
