import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicPageErrorFallback } from '@/components/providers/PublicPageErrorFallback';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = join(
  appRoot,
  'components/providers/PublicPageErrorFallback.tsx'
);

const captureErrorInSentryMock = vi.fn();

vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry: (...args: unknown[]) =>
    captureErrorInSentryMock(...args),
}));

const hashMark = String.fromCharCode(35);
const colorFunctionName = ['r', 'g', 'b', 'a'].join('');
const hardcodedHashColorPattern = new RegExp(`${hashMark}[\\da-fA-F]{3,8}\\b`);
const rawAlphaColorPattern = new RegExp(`${colorFunctionName}\\s*\\(`, 'i');
const rawColorMixPattern = /color-mix\(/i;
const rawVisualUtilityPattern =
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[/;
const hardcodedSvgFillPattern = new RegExp(
  `fill=(['"])${hashMark}[\\da-fA-F]{3,8}\\1`
);

describe('PublicPageErrorFallback', () => {
  const consoleErrorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);

  beforeEach(() => {
    captureErrorInSentryMock.mockReset();
    consoleErrorSpy.mockClear();
  });

  it('renders the inline fallback copy and triggers refresh', () => {
    const refreshMock = vi.fn();

    render(
      <PublicPageErrorFallback
        error={Object.assign(new Error('boom'), { digest: 'abc123' })}
        context='LandingPage'
        onRefresh={refreshMock}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: 'Something Went Wrong',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Try refreshing the page.')).toBeInTheDocument();
    expect(screen.getByText('Error ID: abc123')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveClass(
      'dark',
      'system-b-error-fallback'
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveClass(
      'system-b-error-fallback__action',
      'system-b-error-fallback__action--primary',
      'focus-ring-transparent-offset'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('logs the error and forwards it to Sentry capture when mounted', () => {
    const error = Object.assign(new Error('render failed'), {
      digest: 'digest-1',
    });

    render(<PublicPageErrorFallback error={error} context='Profile' />);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Profile Error]', error);
    expect(captureErrorInSentryMock).toHaveBeenCalledWith(error, 'Profile', {
      digest: 'digest-1',
    });
  });

  it('keeps the source free of local visual styling', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(hardcodedHashColorPattern);
    expect(source).not.toMatch(rawAlphaColorPattern);
    expect(source).not.toMatch(rawColorMixPattern);
    expect(source).not.toMatch(rawVisualUtilityPattern);
    expect(source).not.toMatch(hardcodedSvgFillPattern);
    expect(source).not.toContain('CSSProperties');
    expect(source).not.toContain('const styles');
    expect(source).not.toContain('style={');
    expect(source).not.toContain('JovieMarkElectric');
    expect(source).not.toContain('JOVIE_ICON_PATH');
    expect(source).not.toContain("fill='currentColor'");
    expect(source).not.toContain('focus-ring-transparent-offset');
    expect(source).toContain('SystemBErrorFallback');
  });
});
