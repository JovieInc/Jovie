import { BADGE_SHARED_GEOMETRY_CLASS } from '../../lib/badge-geometry-contract';
import { cn } from '../../lib/utils';

export const BADGE_DRIFT_FIXTURE_RED_STYLE = {
  outline: '2px solid #ff0000',
} as const;

export const BADGE_OVERFLOW_FIXTURE_TEST_ID = 'badge-overflow-fixture';
export const BADGE_BLUE_HOVER_FIXTURE_TEST_ID = 'badge-blue-hover-fixture';
export const BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID =
  'badge-geometry-shift-fixture';

export const BADGE_OVERFLOW_FIXTURE_SOURCE = `
const badgeClassName =
  'whitespace-nowrap overflow-hidden truncate';
`;

export const BADGE_BLUE_HOVER_FIXTURE_SOURCE = `
const badgeClassName =
  'border-error/20 bg-(--color-error-subtle) text-error hover:bg-blue-100 hover:text-blue-900';
`;

export const BADGE_GEOMETRY_SHIFT_FIXTURE_SOURCE = `
const badgeClassName =
  'rounded-none px-6 py-3 mt-4';
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
      className={cn(BADGE_SHARED_GEOMETRY_CLASS, className)}
      style={BADGE_DRIFT_FIXTURE_RED_STYLE}
    >
      {label}
    </span>
  );
}

export function BadgeOverflowDriftFixture() {
  return (
    <DriftFixtureShell
      label='Destructive Action Unavailable'
      testId={BADGE_OVERFLOW_FIXTURE_TEST_ID}
      className='whitespace-nowrap overflow-hidden truncate'
    />
  );
}

export function BadgeBlueHoverDriftFixture() {
  return (
    <DriftFixtureShell
      label='Blue Hover'
      testId={BADGE_BLUE_HOVER_FIXTURE_TEST_ID}
      className='border-error/20 bg-(--color-error-subtle) text-error hover:bg-blue-100 hover:text-blue-900'
    />
  );
}

export function BadgeGeometryShiftDriftFixture() {
  return (
    <DriftFixtureShell
      label='Geometry Shift'
      testId={BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID}
      className='rounded-none px-6 py-3 mt-4'
    />
  );
}
