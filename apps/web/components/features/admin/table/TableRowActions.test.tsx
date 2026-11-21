// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
    expect(badge?.getAttribute('class') ?? '').toMatch(/\bstroke-white\b/);
  });
});
