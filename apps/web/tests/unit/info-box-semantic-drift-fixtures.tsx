import {
  INFOBOX_CONTENT_GEOMETRY_CLASS,
  INFOBOX_SHARED_GEOMETRY_CLASS,
  INFOBOX_TITLE_GEOMETRY_CLASS,
} from '@/components/molecules/info-box-semantic-contract';
import { cn } from '@/lib/utils';

export const INFOBOX_DRIFT_FIXTURE_RED_STYLE = {
  outline: '2px solid #ff0000',
} as const;

export const INFOBOX_RAW_PALETTE_FIXTURE_TEST_ID =
  'infobox-raw-palette-fixture';
export const INFOBOX_BLUE_HOVER_FIXTURE_TEST_ID = 'infobox-blue-hover-fixture';
export const INFOBOX_GEOMETRY_SHIFT_FIXTURE_TEST_ID =
  'infobox-geometry-shift-fixture';

export const INFOBOX_RAW_PALETTE_FIXTURE_SOURCE = `
const variantClasses = {
  info: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
  success: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  error: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
};
`;

export const INFOBOX_BLUE_HOVER_FIXTURE_SOURCE = `
const variantClasses = {
  info: 'bg-info-subtle border-info/20 hover:bg-blue-100 hover:text-blue-900',
};
`;

export const INFOBOX_GEOMETRY_SHIFT_FIXTURE_SOURCE = `
const variantClasses = {
  info: 'bg-info-subtle border-info/20 p-4',
  warning: 'bg-warning-subtle border-warning/20 mt-4',
  success: 'bg-success-subtle border-success/20',
  error: 'bg-error-subtle border-error/20 p-6',
};
`;

interface DriftFixtureProps {
  readonly title: string;
  readonly className: string;
  readonly testId: string;
}

function DriftFixtureShell({ title, className, testId }: DriftFixtureProps) {
  return (
    <div
      data-testid={testId}
      data-deliberate-red=''
      className={cn(INFOBOX_SHARED_GEOMETRY_CLASS, className)}
      style={INFOBOX_DRIFT_FIXTURE_RED_STYLE}
    >
      <h3 className={INFOBOX_TITLE_GEOMETRY_CLASS}>{title}</h3>
      <div className={INFOBOX_CONTENT_GEOMETRY_CLASS}>
        Deliberate-red InfoBox drift fixture.
      </div>
    </div>
  );
}

export function InfoBoxRawPaletteDriftFixture() {
  return (
    <DriftFixtureShell
      title='Raw Palette'
      testId={INFOBOX_RAW_PALETTE_FIXTURE_TEST_ID}
      className='bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20'
    />
  );
}

export function InfoBoxBlueHoverDriftFixture() {
  return (
    <DriftFixtureShell
      title='Blue Hover'
      testId={INFOBOX_BLUE_HOVER_FIXTURE_TEST_ID}
      className='bg-info-subtle border-info/20 hover:bg-blue-100 hover:text-blue-900'
    />
  );
}

export function InfoBoxGeometryShiftDriftFixture() {
  return (
    <DriftFixtureShell
      title='Geometry Shift'
      testId={INFOBOX_GEOMETRY_SHIFT_FIXTURE_TEST_ID}
      className='bg-error-subtle border-error/20 p-6 mt-4'
    />
  );
}
