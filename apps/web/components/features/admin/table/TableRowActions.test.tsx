// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableRowActions } from './TableRowActions';

describe('TableRowActions', () => {
  it('invokes refresh from the control IconButton', async () => {
    const user = userEvent.setup();
    const onRefreshIngest = vi.fn().mockResolvedValue(undefined);
    render(
      <TableRowActions
        isVerified={false}
        isClaimed={false}
        verificationStatus='idle'
        refreshIngestStatus='idle'
        onToggleVerification={vi.fn().mockResolvedValue(undefined)}
        onRefreshIngest={onRefreshIngest}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Refresh creator music data' })
    );
    expect(onRefreshIngest).toHaveBeenCalledOnce();
  });

  it('keeps a contrasting stroke on the verified BadgeCheck fill', () => {
    const { container } = render(
      <TableRowActions
        isVerified
        isClaimed={false}
        verificationStatus='idle'
        refreshIngestStatus='idle'
        onToggleVerification={vi.fn().mockResolvedValue(undefined)}
        onRefreshIngest={vi.fn()}
      />
    );
    const badge = container.querySelector('svg.lucide-badge-check');
    expect(badge?.getAttribute('class') ?? '').toMatch(/\bfill-info\b/);
    expect(badge?.getAttribute('class') ?? '').toMatch(/\bstroke-on-media\b/);
  });

  it('marks a claimed row with the primary token, not a palette colour', async () => {
    const { container } = render(
      <TableRowActions
        isVerified={false}
        isClaimed
        verificationStatus='idle'
        refreshIngestStatus='idle'
        onToggleVerification={vi.fn().mockResolvedValue(undefined)}
        onRefreshIngest={vi.fn()}
      />
    );
    const star = container.querySelector('svg.lucide-star');
    expect(star?.getAttribute('class') ?? '').toMatch(/text-primary-token/);
    expect(star?.getAttribute('class') ?? '').not.toMatch(/yellow/);
    expect(screen.getByRole('button', { name: 'Claimed' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('toggles verification and disables the control while it loads', async () => {
    const user = userEvent.setup();
    const onToggleVerification = vi.fn().mockResolvedValue(undefined);
    const props = {
      isVerified: false,
      isClaimed: false,
      refreshIngestStatus: 'idle' as const,
      onToggleVerification,
      onRefreshIngest: vi.fn(),
    };
    const { container, rerender } = render(
      <TableRowActions {...props} verificationStatus='idle' />
    );
    await user.click(
      screen.getByRole('button', { name: 'Not verified - click to verify' })
    );
    expect(onToggleVerification).toHaveBeenCalledOnce();

    rerender(<TableRowActions {...props} verificationStatus='loading' />);
    expect(
      screen.getByRole('button', { name: 'Not verified - click to verify' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});
