// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoReleaseDetail } from './DemoReleaseDetail';
import { DEMO_RELEASES } from './demo-fixtures';

describe('DemoReleaseDetail', () => {
  it('closes from the header IconButton', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DemoReleaseDetail release={DEMO_RELEASES[0]} onClose={onClose} />);
    await user.click(
      screen.getByRole('button', { name: 'Close Detail Panel' })
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the read-only comment draft unchanged and focused across typing and a rerender', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container, rerender } = render(
      <DemoReleaseDetail release={DEMO_RELEASES[0]} onClose={onClose} />
    );
    const field = screen.getByRole('textbox', { name: 'Add comment' });
    const before = (field as HTMLTextAreaElement).value;

    await user.click(field);
    await user.keyboard('typed text{Escape}');
    rerender(
      <DemoReleaseDetail release={DEMO_RELEASES[0]} onClose={onClose} />
    );

    expect(field).toHaveValue(before);
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('data-host-drawn');
    await expectNoA11yViolations(container);
  });
});
