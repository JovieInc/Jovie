import { MATCH_STATUS_BADGE_STYLES } from '@/features/dashboard/atoms/dashboard-status-badge-semantic-contract';
import { cn } from '@/lib/utils';

export const STATUS_BADGE_DRIFT_FIXTURE_RED_STYLE = {
  outline: '2px solid #ff0000',
} as const;

export const STATUS_BADGE_RAW_PALETTE_FIXTURE_TEST_ID =
  'status-badge-raw-palette-fixture';
export const STATUS_BADGE_BLUE_HOVER_FIXTURE_TEST_ID =
  'status-badge-blue-hover-fixture';
export const STATUS_BADGE_CLIPPING_NOWRAP_FIXTURE_TEST_ID =
  'status-badge-clipping-nowrap-fixture';
export const STATUS_BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID =
  'status-badge-geometry-shift-fixture';

export const STATUS_BADGE_RAW_PALETTE_FIXTURE_SOURCE = `
const statusStyles = {
  suggested: {
    className: 'bg-blue-50 border-blue-200 text-blue-900',
    dotClassName: 'bg-blue-500',
  },
};
`;

export const STATUS_BADGE_BLUE_HOVER_FIXTURE_SOURCE = `
const statusStyles = {
  suggested: {
    className: 'border-info/20 bg-surface-1 text-info hover:bg-blue-100 hover:text-blue-900',
    dotClassName: 'bg-info',
  },
};
`;

export const STATUS_BADGE_CLIPPING_NOWRAP_FIXTURE_SOURCE = `
const statusStyles = {
  auto_confirmed: {
    className: 'border-success/20 bg-surface-1 text-success overflow-hidden truncate whitespace-normal',
    dotClassName: 'bg-success',
  },
};
`;

export const STATUS_BADGE_GEOMETRY_SHIFT_FIXTURE_SOURCE = `
const statusStyles = {
  suggested: {
    className: 'border-info/20 bg-surface-1 text-info p-4 min-h-10',
    dotClassName: 'bg-info',
  },
};
`;

interface DriftFixtureProps {
  readonly label: string;
  readonly className: string;
  readonly testId: string;
}

function DriftFixtureShell({ label, className, testId }: DriftFixtureProps) {
  return (
    <span
      data-testid={testId}
      data-deliberate-red=''
      className={cn(
        'inline-flex w-fit items-center rounded-full border',
        className
      )}
      style={STATUS_BADGE_DRIFT_FIXTURE_RED_STYLE}
    >
      <span aria-hidden className='mr-1.5 inline-block size-1.5 rounded-full' />
      {label}
    </span>
  );
}

export function StatusBadgeRawPaletteDriftFixture() {
  return (
    <DriftFixtureShell
      label='Suggested'
      testId={STATUS_BADGE_RAW_PALETTE_FIXTURE_TEST_ID}
      className='bg-blue-50 border-blue-200 text-blue-900'
    />
  );
}

export function StatusBadgeBlueHoverDriftFixture() {
  return (
    <DriftFixtureShell
      label='Suggested'
      testId={STATUS_BADGE_BLUE_HOVER_FIXTURE_TEST_ID}
      className='border-info/20 bg-surface-1 text-info hover:bg-blue-100 hover:text-blue-900'
    />
  );
}

export function StatusBadgeClippingNowrapDriftFixture() {
  return (
    <DriftFixtureShell
      label={MATCH_STATUS_BADGE_STYLES.auto_confirmed.label}
      testId={STATUS_BADGE_CLIPPING_NOWRAP_FIXTURE_TEST_ID}
      className='border-success/20 bg-surface-1 text-success overflow-hidden truncate whitespace-normal'
    />
  );
}

export function StatusBadgeGeometryShiftDriftFixture() {
  return (
    <DriftFixtureShell
      label='Suggested'
      testId={STATUS_BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID}
      className='border-info/20 bg-surface-1 text-info p-4 min-h-10'
    />
  );
}
