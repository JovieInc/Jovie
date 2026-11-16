import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthLoader } from './AuthLoader';

describe('AuthLoader certificate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is one axe-clean busy status before the delayed message shows', async () => {
    const { container } = render(<AuthLoader />);

    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('p')).toHaveClass('opacity-0');
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean once the message fades in after two seconds', async () => {
    const { container } = render(<AuthLoader />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(container.querySelector('p')).toHaveClass('opacity-100');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('keeps the status inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AuthLoader />
      </div>
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });
});
