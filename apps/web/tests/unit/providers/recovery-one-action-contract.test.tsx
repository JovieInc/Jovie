import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RootError from '@/app/error';
import {
  inspectRecoveryActions,
  recoveryActionIssueCodes,
} from '@/tests/utils/recovery-actions';
import {
  RECOVERY_NESTED_INTERACTIVE_FIXTURE_TEST_ID,
  RECOVERY_SECOND_ACTION_FIXTURE_TEST_ID,
  RecoveryNestedInteractiveFixture,
  RecoverySecondActionFixture,
} from './recovery-one-action-fixtures';

const webRoot = resolve(__dirname, '../../..');

const CANONICAL_PRESENTER_SOURCES = [
  'components/organisms/ErrorBoundary.tsx',
  'components/providers/SystemBErrorFallback.tsx',
  'components/providers/PublicPageErrorFallback.tsx',
  'components/features/feedback/PageErrorState.tsx',
  'app/error.tsx',
  'app/global-error.tsx',
] as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('Recovery one-action contract', () => {
  it('renders the root error presenter with one retry action', () => {
    const reset = vi.fn();
    const { container } = render(
      <RootError
        error={Object.assign(new Error('boom'), { digest: 'digest-1' })}
        reset={reset}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(inspectRecoveryActions(container).issues).toEqual([]);
  });

  it('rejects the second-action deliberate-red fixture', () => {
    const { container } = render(<RecoverySecondActionFixture />);
    const fixture = screen.getByTestId(RECOVERY_SECOND_ACTION_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeInTheDocument();
    expect(inspectRecoveryActions(container).recoveryActionCount).toBe(2);
    expect(recoveryActionIssueCodes(inspectRecoveryActions(container))).toEqual(
      ['second-action']
    );
  });

  it('rejects the nested link/button deliberate-red fixture', () => {
    const { container } = render(<RecoveryNestedInteractiveFixture />);
    const fixture = screen.getByTestId(
      RECOVERY_NESTED_INTERACTIVE_FIXTURE_TEST_ID
    );

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(container.querySelector('a button')).not.toBeNull();
    expect(
      inspectRecoveryActions(container).nestedInteractiveCount
    ).toBeGreaterThan(0);
    expect(recoveryActionIssueCodes(inspectRecoveryActions(container))).toEqual(
      ['nested-interactive']
    );
    expect(
      readSource('tests/unit/providers/recovery-one-action-fixtures.tsx')
    ).toMatch(/<a\b[^>]*>\s*<Button\b/);
  });

  it('keeps production presenters off the deliberate-red fixtures', () => {
    const consumerSources = globSync('app/**/error.tsx', { cwd: webRoot });

    for (const sourcePath of [
      ...CANONICAL_PRESENTER_SOURCES,
      ...consumerSources,
    ]) {
      const source = readSource(sourcePath);
      expect(source, sourcePath).not.toContain('data-deliberate-red');
      expect(source, sourcePath).not.toContain('recovery-one-action-fixtures');
    }

    for (const sourcePath of CANONICAL_PRESENTER_SOURCES) {
      const source = readSource(sourcePath);
      expect(source, sourcePath).not.toContain('Go Home');
      expect(source, sourcePath).not.toMatch(/<a\b[^>]*>\s*<Button\b/);
    }

    const errorBoundaryConsumers = consumerSources.filter(sourcePath =>
      readSource(sourcePath).includes(
        "from '@/components/organisms/ErrorBoundary'"
      )
    );
    expect(errorBoundaryConsumers.length).toBeGreaterThanOrEqual(20);
    for (const sourcePath of errorBoundaryConsumers) {
      expect(readSource(sourcePath), sourcePath).not.toContain('Go Home');
    }
  });
});
