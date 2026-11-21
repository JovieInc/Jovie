import { Button } from '@jovie/ui';
import { SlidersHorizontal } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  CONSUMER_FILTERS,
  type ConsumerFilter,
  GROUP_FILTERS,
  type GroupFilter,
  SURFACE_FILTERS,
  type SurfaceFilter,
} from './ScreenshotGallery.helpers';

interface FilterPillsProps<Id extends string> {
  readonly filters: ReadonlyArray<{ readonly id: Id; readonly label: string }>;
  readonly value: Id;
  readonly onChange: (id: Id) => void;
}

function FilterPills<Id extends string>({
  filters,
  value,
  onChange,
}: Readonly<FilterPillsProps<Id>>) {
  return (
    <div className='flex flex-wrap gap-2'>
      {filters.map(filter => (
        <Button
          key={filter.id}
          type='button'
          variant={value === filter.id ? 'secondary' : 'ghost'}
          size='sm'
          onClick={() => onChange(filter.id)}
          aria-pressed={value === filter.id}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  );
}

interface ScreenshotFilterBarProps {
  readonly shown: number;
  readonly total: number;
  readonly canonical: number;
  readonly other: number;
  readonly surfaceFilter: SurfaceFilter;
  readonly groupFilter: GroupFilter;
  readonly consumerFilter: ConsumerFilter;
  readonly onSurfaceChange: (id: SurfaceFilter) => void;
  readonly onGroupChange: (id: GroupFilter) => void;
  readonly onConsumerChange: (id: ConsumerFilter) => void;
}

/** The gallery's counts line and its surface, group and use-case filters. */
export function ScreenshotFilterBar({
  shown,
  total,
  canonical,
  other,
  surfaceFilter,
  groupFilter,
  consumerFilter,
  onSurfaceChange,
  onGroupChange,
  onConsumerChange,
}: Readonly<ScreenshotFilterBarProps>) {
  return (
    <ContentSurfaceCard>
      <div className='space-y-4 p-4'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <p className='text-xs font-semibold text-primary-token'>
              Screenshot Set
            </p>
            <p className='text-xs text-secondary-token'>
              Showing {shown} of {total} captures. Canonical: {canonical}.
              Other: {other}.
            </p>
          </div>
          <FilterPills
            filters={SURFACE_FILTERS}
            value={surfaceFilter}
            onChange={onSurfaceChange}
          />
        </div>
        <details className='group rounded-md border border-subtle bg-surface-0'>
          <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-primary-token'>
            <span className='inline-flex items-center gap-2'>
              <SlidersHorizontal className='size-3.5' aria-hidden />
              More Filters
            </span>
            <span className='text-2xs font-normal text-tertiary-token'>
              Group and use case
            </span>
          </summary>
          <div className='space-y-3 px-3 pb-3 pt-1'>
            <div className='space-y-2'>
              <p className='text-xs font-semibold text-primary-token'>
                Capture Group
              </p>
              <FilterPills
                filters={GROUP_FILTERS}
                value={groupFilter}
                onChange={onGroupChange}
              />
            </div>
            <div className='space-y-2'>
              <p className='text-xs font-semibold text-primary-token'>
                Use Case
              </p>
              <FilterPills
                filters={CONSUMER_FILTERS}
                value={consumerFilter}
                onChange={onConsumerChange}
              />
            </div>
          </div>
        </details>
      </div>
    </ContentSurfaceCard>
  );
}
