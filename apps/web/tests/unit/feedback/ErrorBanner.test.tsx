import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { ErrorBanner } from '@/features/feedback/ErrorBanner';
import {
  ERROR_BANNER_ACTION_SIZE,
  ERROR_BANNER_COPY_SIZE,
  ERROR_BANNER_DESCRIPTION_CLASS,
  ERROR_BANNER_DISMISS_SIZE,
  ERROR_BANNER_SHELL_GEOMETRY_CLASS,
  ERROR_BANNER_SHELL_SEMANTIC_CLASS,
  ERROR_BANNER_TITLE_CLASS,
} from '@/features/feedback/error-banner-semantic-contract';
import {
  auditErrorBannerSource,
  codesOf,
  ERROR_BANNER_DRIFT_CLASSES,
} from './error-banner-semantic-audit';
import {
  ERROR_BANNER_GEOMETRY_SHIFT_FIXTURE_SOURCE,
  ERROR_BANNER_GEOMETRY_SHIFT_FIXTURE_TEST_ID,
  ERROR_BANNER_RAW_PALETTE_FIXTURE_SOURCE,
  ERROR_BANNER_RAW_PALETTE_FIXTURE_TEST_ID,
  ERROR_BANNER_UNDERSIZED_TARGET_FIXTURE_SOURCE,
  ERROR_BANNER_UNDERSIZED_TARGET_FIXTURE_TEST_ID,
  ErrorBannerGeometryShiftDriftFixture,
  ErrorBannerRawPaletteDriftFixture,
  ErrorBannerUndersizedTargetDriftFixture,
} from './error-banner-semantic-drift-fixtures';

const webRoot = path.resolve(__dirname, '../../..');
const errorBannerSourcePath = path.join(
  webRoot,
  'components/features/feedback/ErrorBanner.tsx'
);
const contractSourcePath = path.join(
  webRoot,
  'components/features/feedback/error-banner-semantic-contract.ts'
);
const fixtureSourcePath = path.join(
  __dirname,
  'error-banner-semantic-drift-fixtures.tsx'
);

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function getBanner(testId = 'app-error-banner'): HTMLElement {
  return screen.getByTestId(testId);
}

describe('ErrorBanner', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders title and description with test id', () => {
    render(
      <ErrorBanner
        title='Test error'
        description='Something failed'
        testId='error-banner-test'
      />
    );

    expect(screen.getByTestId('error-banner-test')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('invokes button actions', () => {
    const onClick = vi.fn();
    render(
      <ErrorBanner
        title='Actionable error'
        actions={[{ label: 'Retry now', onClick }]}
      />
    );

    const actionButton = screen.getByText('Retry now');
    fireEvent.click(actionButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders link actions', () => {
    render(
      <ErrorBanner
        title='Link error'
        actions={[{ label: 'Open help', href: '/support' }]}
      />
    );

    const link = screen.getByText('Open help');
    expect(link).toHaveAttribute('href', '/support');
  });

  it('uses shared button variants to keep secondary exits quiet', () => {
    render(
      <ErrorBanner
        title='Action hierarchy'
        actions={[
          { label: 'Retry', onClick: vi.fn(), variant: 'primary' },
          { label: 'Return to Jovie', href: '/', variant: 'secondary' },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Retry' })).toHaveAttribute(
      'data-variant',
      'primary'
    );
    expect(
      screen.getByRole('link', { name: 'Return to Jovie' })
    ).toHaveAttribute('data-variant', 'secondary');
  });

  describe('dismiss functionality', () => {
    it('renders close button when onDismiss is provided', () => {
      const onDismiss = vi.fn();
      render(<ErrorBanner title='Dismissible error' onDismiss={onDismiss} />);

      const closeButton = screen.getByRole('button', {
        name: 'Dismiss Error',
      });
      expect(closeButton).toBeInTheDocument();
    });

    it('does not render close button when onDismiss is not provided', () => {
      render(<ErrorBanner title='Non-dismissible error' />);

      const closeButton = screen.queryByRole('button', {
        name: 'Dismiss Error',
      });
      expect(closeButton).not.toBeInTheDocument();
    });

    it('invokes onDismiss callback when close button is clicked', () => {
      const onDismiss = vi.fn();
      render(<ErrorBanner title='Dismissible error' onDismiss={onDismiss} />);

      const closeButton = screen.getByRole('button', {
        name: 'Dismiss Error',
      });
      fireEvent.click(closeButton);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('close button has correct aria-label for accessibility', () => {
      const onDismiss = vi.fn();
      render(<ErrorBanner title='Dismissible error' onDismiss={onDismiss} />);

      const closeButton = screen.getByRole('button', {
        name: 'Dismiss Error',
      });
      expect(closeButton).toHaveAttribute('aria-label', 'Dismiss Error');
    });
  });
});

describe('ErrorBanner semantic color and target ownership', () => {
  it('keeps production source on approved error tokens and target sizes', () => {
    const bannerSource = readSource(errorBannerSourcePath);
    const contractSource = readSource(contractSourcePath);

    expect(codesOf(auditErrorBannerSource(bannerSource))).toEqual([]);
    expect(codesOf(auditErrorBannerSource(contractSource))).toEqual([]);
    expect(ERROR_BANNER_DRIFT_CLASSES).toEqual([
      'raw-palette',
      'undersized-target',
      'geometry-shift',
    ]);

    expect(bannerSource).toContain('ERROR_BANNER_SHELL_SEMANTIC_CLASS');
    expect(bannerSource).toContain('ERROR_BANNER_ACTION_SIZE');
    expect(bannerSource).toContain('ERROR_BANNER_COPY_SIZE');
    expect(bannerSource).toContain('ERROR_BANNER_DISMISS_SIZE');
    expect(bannerSource).not.toContain('error-banner-semantic-drift-fixtures');
    expect(bannerSource).not.toContain('text-error-foreground');
    expect(bannerSource).not.toMatch(/hover:bg-red/);
    expect(contractSource).toContain('bg-error-subtle');
    expect(contractSource).toContain('border-error/20');
    expect(contractSource).toContain('text-error');
    expect(contractSource).toContain('rounded-lg');
    expect(contractSource).toContain("ERROR_BANNER_ACTION_SIZE = 'sm'");
    expect(contractSource).toContain("ERROR_BANNER_DISMISS_SIZE = 'icon-sm'");
  });

  it('renders the shell on semantic error tokens without changing geometry', () => {
    render(
      <ErrorBanner
        title='Failed to save changes'
        description='Please check your connection and try again.'
      />
    );

    const banner = getBanner();
    expect(banner).toHaveClass(
      ...ERROR_BANNER_SHELL_GEOMETRY_CLASS.split(' '),
      ...ERROR_BANNER_SHELL_SEMANTIC_CLASS.split(' ')
    );
    expect(screen.getByText('Failed to save changes')).toHaveClass(
      ...ERROR_BANNER_TITLE_CLASS.split(' ')
    );
    expect(
      screen.getByText('Please check your connection and try again.')
    ).toHaveClass(...ERROR_BANNER_DESCRIPTION_CLASS.split(' '));
    expect(banner.className).not.toMatch(
      /\b(?:bg|border|text)-(?:red|blue|green|yellow)-\d+/
    );
  });

  it('keeps one primary recovery owner and canonical action targets', () => {
    render(
      <ErrorBanner
        title='Failed to load profile'
        actions={[
          { label: 'Try again', onClick: vi.fn() },
          { label: 'Return to Jovie', href: '/' },
        ]}
        onDismiss={vi.fn()}
      />
    );

    const retry = screen.getByRole('button', { name: 'Try again' });
    const secondary = screen.getByRole('link', { name: 'Return to Jovie' });
    const dismiss = screen.getByRole('button', { name: 'Dismiss Error' });

    expect(retry).toHaveAttribute('data-variant', 'primary');
    expect(retry).toHaveAttribute('data-size', ERROR_BANNER_ACTION_SIZE);
    expect(retry.className).toContain('before:h-11');
    expect(retry.className).toContain('rounded-full');
    expect(secondary).toHaveAttribute('data-variant', 'secondary');
    expect(secondary).toHaveAttribute('data-size', ERROR_BANNER_ACTION_SIZE);
    expect(secondary.className).toContain('before:h-11');
    expect(dismiss).toHaveAttribute('data-size', ERROR_BANNER_DISMISS_SIZE);
    expect(dismiss.className).toContain('before:h-11');
    expect(dismiss.className).toContain('before:w-11');
    expect(dismiss.className).toContain('rounded-full');
    expect(
      screen.queryAllByRole('button', { hidden: true }).filter(button => {
        return button.getAttribute('data-variant') === 'primary';
      })
    ).toHaveLength(1);
  });

  it('keeps copy details on the canonical sm target after disclosure', () => {
    render(
      <ErrorBanner
        title='Failed to load profile'
        error={Object.assign(new Error('timed out'), { digest: 'abc123' })}
      />
    );

    expect(screen.queryByText('Error ID: abc123')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Error details' }));

    expect(screen.getByText('Error ID: abc123')).toBeInTheDocument();
    const copy = screen.getByRole('button', {
      name: 'Copy Error Details To Clipboard',
    });
    expect(copy).toHaveAttribute('data-size', ERROR_BANNER_COPY_SIZE);
    expect(copy.className).toContain('before:h-11');
    expect(copy.className).toContain('rounded-full');
    expect(copy.className).not.toMatch(/\bh-auto\b/);
    expect(copy.className).not.toMatch(/\brounded-md\b/);
  });

  it('copies support details and keeps the recovery action canonical', async () => {
    render(
      <ErrorBanner
        title='Failed to save changes'
        description='Please retry.'
        actions={[{ label: 'Try again', onClick: vi.fn() }]}
        error={Object.assign(new Error('timed out'), { digest: 'abc123' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Error details' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy Error Details To Clipboard' })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Error ID: abc123')
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Description: Please retry.')
    );
    expect(toastSuccess).toHaveBeenCalledWith('Copied');
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute(
      'data-size',
      ERROR_BANNER_ACTION_SIZE
    );
  });

  it('reports copy failure without changing banner geometry', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });

    render(<ErrorBanner title='Failed to save changes' />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Error details' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy Error Details To Clipboard' })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(toastError).toHaveBeenCalledWith('Failed to copy error details');
    expect(getBanner()).toHaveClass(
      ...ERROR_BANNER_SHELL_GEOMETRY_CLASS.split(' ')
    );
  });

  it('renders external recovery links on the canonical sm target', () => {
    render(
      <ErrorBanner
        title='Link error'
        actions={[{ label: 'Open docs', href: 'https://jov.ie/docs' }]}
      />
    );

    const link = screen.getByRole('link', { name: 'Open docs' });
    expect(link).toHaveAttribute('href', 'https://jov.ie/docs');
    expect(link).toHaveAttribute('data-size', ERROR_BANNER_ACTION_SIZE);
    expect(link.className).toContain('before:h-11');
  });

  it('keeps an internal link with onClick on the same target contract', () => {
    const onClick = vi.fn();
    render(
      <ErrorBanner
        title='Link error'
        actions={[{ label: 'Open help', href: '/support', onClick }]}
      />
    );

    const link = screen.getByRole('link', { name: 'Open help' });
    expect(link).toHaveAttribute('href', '/support');
    expect(link).toHaveAttribute('data-size', ERROR_BANNER_ACTION_SIZE);
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to Action when a recovery label is missing', () => {
    render(
      <ErrorBanner
        title='Link error'
        actions={[{ label: '', onClick: vi.fn() }]}
      />
    );

    expect(screen.getByRole('button', { name: 'Action' })).toHaveAttribute(
      'data-size',
      ERROR_BANNER_ACTION_SIZE
    );
  });

  it('hides details without shifting the shell geometry', () => {
    render(
      <ErrorBanner
        title='Failed to load profile'
        error={Object.assign(new Error('timed out'), { digest: 'abc123' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Error details' }));
    expect(screen.getByText('Error ID: abc123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Error details' }));
    expect(screen.queryByText('Error ID: abc123')).not.toBeInTheDocument();
    expect(getBanner()).toHaveClass(
      ...ERROR_BANNER_SHELL_GEOMETRY_CLASS.split(' ')
    );
  });

  it('keeps shell geometry stable when dismiss and recovery actions appear', () => {
    const { rerender } = render(
      <ErrorBanner title='Stable geometry' description='Same copy' />
    );

    const geometry = new Set(ERROR_BANNER_SHELL_GEOMETRY_CLASS.split(' '));
    const idle = getBanner();
    expect(idle.className.split(/\s+/)).toEqual(
      expect.arrayContaining([...geometry])
    );

    rerender(
      <ErrorBanner
        title='Stable geometry'
        description='Same copy'
        actions={[{ label: 'Try again', onClick: vi.fn() }]}
        onDismiss={vi.fn()}
      />
    );

    const withActions = getBanner();
    expect(withActions.className.split(/\s+/)).toEqual(
      expect.arrayContaining([...geometry])
    );
    expect(withActions).toHaveClass(
      ...ERROR_BANNER_SHELL_SEMANTIC_CLASS.split(' ')
    );
  });
});

describe('ErrorBanner deliberate-red drift fixtures', () => {
  it('rejects the raw-palette fixture', () => {
    expect(
      codesOf(auditErrorBannerSource(ERROR_BANNER_RAW_PALETTE_FIXTURE_SOURCE))
    ).toEqual(['raw-palette']);

    render(<ErrorBannerRawPaletteDriftFixture />);
    const fixture = screen.getByTestId(
      ERROR_BANNER_RAW_PALETTE_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture).toHaveClass(
      'bg-red-50',
      'border-red-500/40',
      'text-red-700'
    );
    expect(readSource(errorBannerSourcePath)).not.toContain(
      ERROR_BANNER_RAW_PALETTE_FIXTURE_TEST_ID
    );
  });

  it('rejects the undersized-target fixture', () => {
    expect(
      codesOf(
        auditErrorBannerSource(ERROR_BANNER_UNDERSIZED_TARGET_FIXTURE_SOURCE)
      )
    ).toEqual(['undersized-target']);

    render(<ErrorBannerUndersizedTargetDriftFixture />);
    const fixture = screen.getByTestId(
      ERROR_BANNER_UNDERSIZED_TARGET_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture.className).toMatch(/\bh-auto\b/);
    expect(fixture.className).toMatch(/\bp-1\.5\b/);
    expect(fixture.className).toMatch(/\brounded-md\b/);
    expect(readSource(errorBannerSourcePath)).not.toContain(
      ERROR_BANNER_UNDERSIZED_TARGET_FIXTURE_TEST_ID
    );
  });

  it('rejects the geometry-shift fixture', () => {
    expect(
      codesOf(
        auditErrorBannerSource(ERROR_BANNER_GEOMETRY_SHIFT_FIXTURE_SOURCE)
      )
    ).toEqual(['geometry-shift']);

    render(<ErrorBannerGeometryShiftDriftFixture />);
    const fixture = screen.getByTestId(
      ERROR_BANNER_GEOMETRY_SHIFT_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture.className).toMatch(/\brounded-2xl\b/);
    expect(fixture.className).toMatch(/\bp-6\b/);
    expect(fixture.className).toMatch(/\bmt-4\b/);
    expect(readSource(errorBannerSourcePath)).not.toContain(
      ERROR_BANNER_GEOMETRY_SHIFT_FIXTURE_TEST_ID
    );
    expect(readSource(fixtureSourcePath)).toContain('data-deliberate-red');
  });
});
