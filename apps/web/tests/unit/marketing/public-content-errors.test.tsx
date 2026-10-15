import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LegalError from '@/app/(dynamic)/legal/error';
import BlogError from '@/app/(marketing)/blog/error';
import ChangelogError from '@/app/(marketing)/changelog/error';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';

vi.mock('@/lib/errors/capture', () => ({ captureErrorInSentry: vi.fn() }));

describe('public content failure states', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { name: 'blog', ErrorPage: BlogError },
    { name: 'changelog', ErrorPage: ChangelogError },
    { name: 'legal', ErrorPage: LegalError },
  ])('keeps $name recovery in the reading frame', ({ ErrorPage }) => {
    const reset = vi.fn();
    const { container } = render(
      <ErrorPage error={new Error('Content unavailable')} reset={reset} />
    );
    const frame = container.querySelector('[data-public-content-shell]');
    expect(frame).toHaveAttribute('data-public-content-width', 'prose');
    expect(frame).toContainElement(screen.getByRole('alert'));
    expect(container.querySelector('main, header, footer')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: RECOVERY_COPY.retryLabel })
    );
    expect(reset).toHaveBeenCalledOnce();
  });
});
