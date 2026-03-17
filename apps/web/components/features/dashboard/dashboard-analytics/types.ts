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
  /** Maximum retention days for the user's plan. Ranges beyond this are disabled. */
  readonly maxRetentionDays?: number;
}

/** Map range values to the number of days they represent. */
export const RANGE_DAYS: Record<Range, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
};

export const RANGE_OPTIONS: readonly RangeOption[] = [
  { label: '1d', value: '1d' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
] as const;
