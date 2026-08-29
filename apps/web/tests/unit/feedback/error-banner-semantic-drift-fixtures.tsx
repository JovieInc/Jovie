import {
  ERROR_BANNER_BODY_CLASS,
  ERROR_BANNER_DESCRIPTION_CLASS,
  ERROR_BANNER_ICON_CLASS,
  ERROR_BANNER_ICON_WRAP_CLASS,
  ERROR_BANNER_ROW_CLASS,
  ERROR_BANNER_SHELL_GEOMETRY_CLASS,
  ERROR_BANNER_TITLE_CLASS,
} from '@/features/feedback/error-banner-semantic-contract';
import { cn } from '@/lib/utils';

export const ERROR_BANNER_DRIFT_FIXTURE_RED_STYLE = {
  outline: '2px solid #ff0000',
} as const;

export const ERROR_BANNER_RAW_PALETTE_FIXTURE_TEST_ID =
  'error-banner-raw-palette-fixture';
export const ERROR_BANNER_UNDERSIZED_TARGET_FIXTURE_TEST_ID =
  'error-banner-undersized-target-fixture';
export const ERROR_BANNER_GEOMETRY_SHIFT_FIXTURE_TEST_ID =
  'error-banner-geometry-shift-fixture';

export const ERROR_BANNER_RAW_PALETTE_FIXTURE_SOURCE = `
const shellClass =
  'border-red-500/40 bg-red-50 text-red-700 dark:bg-red-900/40';
const dismissClass =
  'text-red-100 hover:text-white hover:bg-red-500/20 dark:text-red-200';
`;

export const ERROR_BANNER_UNDERSIZED_TARGET_FIXTURE_SOURCE = `
const dismissClass =
  'h-auto rounded-md p-1.5 px-2 py-1 text-xs before:hidden';
const copyClass = 'inline-flex h-auto items-center rounded-md px-2 py-1';
`;

export const ERROR_BANNER_GEOMETRY_SHIFT_FIXTURE_SOURCE = `
const shellClass =
  'rounded-2xl border border-error/20 bg-error-subtle p-6 mt-4 text-error';
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
      className={cn(ERROR_BANNER_SHELL_GEOMETRY_CLASS, className)}
      style={ERROR_BANNER_DRIFT_FIXTURE_RED_STYLE}
    >
      <div className={ERROR_BANNER_ROW_CLASS}>
        <span className={ERROR_BANNER_ICON_WRAP_CLASS}>
          <span className={ERROR_BANNER_ICON_CLASS} />
        </span>
        <div className={ERROR_BANNER_BODY_CLASS}>
          <p className={ERROR_BANNER_TITLE_CLASS}>{title}</p>
          <p className={ERROR_BANNER_DESCRIPTION_CLASS}>
            Deliberate-red ErrorBanner drift fixture.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ErrorBannerRawPaletteDriftFixture() {
  return (
    <DriftFixtureShell
      title='Raw Palette'
      testId={ERROR_BANNER_RAW_PALETTE_FIXTURE_TEST_ID}
      className='border-red-500/40 bg-red-50 text-red-700 dark:bg-red-900/40'
    />
  );
}

export function ErrorBannerUndersizedTargetDriftFixture() {
  return (
    <DriftFixtureShell
      title='Undersized Target'
      testId={ERROR_BANNER_UNDERSIZED_TARGET_FIXTURE_TEST_ID}
      className='h-auto w-auto rounded-md p-1.5'
    />
  );
}

export function ErrorBannerGeometryShiftDriftFixture() {
  return (
    <DriftFixtureShell
      title='Geometry Shift'
      testId={ERROR_BANNER_GEOMETRY_SHIFT_FIXTURE_TEST_ID}
      className='rounded-2xl p-6 mt-4'
    />
  );
}
