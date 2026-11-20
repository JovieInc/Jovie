// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_RELEASES } from './demo-fixtures';
import { DemoReleaseDetail } from './DemoReleaseDetail';

describe('DemoReleaseDetail', () => {
  it('closes from the header IconButton', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DemoReleaseDetail release={DEMO_RELEASES[0]} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close Detail Panel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
