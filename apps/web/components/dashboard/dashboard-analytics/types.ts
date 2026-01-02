import type { AnalyticsRange } from '@/types/analytics';

export type Range = Extract<AnalyticsRange, '1d' | '7d' | '30d'>;

export interface RangeOption {
  label: string;
  value: Range;
}

export interface RangeToggleProps {
  value: Range;
  onChange: (v: Range) => void;
  tabsBaseId: string;
  panelId: string;
}

export const RANGE_OPTIONS: readonly RangeOption[] = [
  { label: '1d', value: '1d' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
] as const;
