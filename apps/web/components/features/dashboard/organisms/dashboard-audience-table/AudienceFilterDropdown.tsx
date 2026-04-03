'use client';

import { useCallback, useMemo } from 'react';
import {
  TableFilterDropdown,
  type TableFilterDropdownCategory,
} from '@/components/molecules/filters';
import type { AudienceFilters } from './types';

type SegmentId =
  | 'highIntent'
  | 'returning'
  | 'frequent'
  | 'recent24h'
  | 'touringCity';

const SEGMENT_OPTIONS: readonly {
  id: SegmentId;
  label: string;
  iconName: string;
}[] = [
  { id: 'highIntent', label: 'High Intent', iconName: 'Bolt' },
  { id: 'returning', label: 'Returning', iconName: 'RefreshCw' },
  { id: 'frequent', label: '3+ Visits', iconName: 'RefreshCw' },
  { id: 'recent24h', label: 'Last 24h', iconName: 'AlarmClock' },
  { id: 'touringCity', label: 'Touring City', iconName: 'MapPin' },
];

interface AudienceFilterDropdownProps {
  readonly filters: AudienceFilters;
  readonly onFiltersChange: (filters: AudienceFilters) => void;
  readonly buttonClassName?: string;
  readonly iconOnly?: boolean;
}

export function AudienceFilterDropdown({
  filters,
  onFiltersChange,
  buttonClassName,
  iconOnly = true,
}: Readonly<AudienceFilterDropdownProps>) {
  const handleSegmentToggle = useCallback(
    (id: SegmentId) => {
      const newSegments = filters.segments.includes(id)
        ? filters.segments.filter(segment => segment !== id)
        : [...filters.segments, id];

      onFiltersChange({ ...filters, segments: newSegments });
    },
    [filters, onFiltersChange]
  );

  const categories = useMemo<readonly TableFilterDropdownCategory<SegmentId>[]>(
    () => [
      {
        id: 'segments',
        label: 'Segments',
        iconName: 'Filter',
        options: SEGMENT_OPTIONS,
        selectedIds: filters.segments,
        onToggle: handleSegmentToggle,
        searchPlaceholder: 'Search segments...',
      },
    ],
    [filters.segments, handleSegmentToggle]
  );

  return (
    <TableFilterDropdown
      categories={categories}
      buttonClassName={buttonClassName}
      iconOnly={iconOnly}
      onClearAll={() => onFiltersChange({ ...filters, segments: [] })}
    />
  );
}
