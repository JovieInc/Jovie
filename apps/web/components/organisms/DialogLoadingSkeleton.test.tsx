import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DialogLoadingSkeleton } from './DialogLoadingSkeleton';

describe('DialogLoadingSkeleton', () => {
  it('renders the search card and three result rows by default and is axe-clean', async () => {
    const { baseElement } = render(
      <DialogLoadingSkeleton open onClose={vi.fn()} />
    );

    expect(
      screen.getByTestId('dialog-loading-search-card')
    ).toBeInTheDocument();
    const results = screen.getByTestId('dialog-loading-results-card');
    expect(results.firstElementChild?.children).toHaveLength(3);
    await expectNoA11yViolations(baseElement);
  });

  it('renders the requested number of rows', async () => {
    const { baseElement } = render(
      <DialogLoadingSkeleton open onClose={vi.fn()} rows={1} size='sm' />
    );

    const results = screen.getByTestId('dialog-loading-results-card');
    expect(results.firstElementChild?.children).toHaveLength(1);
    await expectNoA11yViolations(baseElement);
  });

  it('renders nothing when closed', () => {
    render(<DialogLoadingSkeleton open={false} onClose={vi.fn()} />);

    expect(
      screen.queryByTestId('dialog-loading-search-card')
    ).not.toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DialogLoadingSkeleton open onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
