import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { success } = vi.hoisted(() => ({ success: vi.fn() }));

vi.mock('@/components/feedback', () => ({
  toast: { success, error: vi.fn() },
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

import { SmartLinkCell } from './SmartLinkCell';

type Props = ComponentProps<typeof SmartLinkCell>;

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  status: 'released',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-06-15',
  totalTracks: 1,
  providers: [],
  smartLinkPath: '/smart/release-1',
};

function renderCell(overrides: Partial<Props> = {}) {
  return render(
    <TooltipProvider>
      <SmartLinkCell release={release} {...overrides} />
    </TooltipProvider>
  );
}

// These render full tables and Radix menus; a loaded CI runner needs more than
// the default five seconds.
vi.setConfig({ testTimeout: 20_000 });

describe('SmartLinkCell certificate', () => {
  beforeEach(() => success.mockClear());

  it('copies the full smart link and confirms with a release-scoped toast', async () => {
    const user = userEvent.setup();
    const { container } = renderCell();

    expect(screen.getByText('/smart/release-1')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /Copy smart link/i }));
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith('Skyline Dreams smart link copied', {
        id: 'smart-link-copy-release-1',
      })
    );
    expect(await navigator.clipboard.readText()).toBe(
      'https://jov.ie/smart/release-1'
    );
  });

  it('shows the plan lock with no copy or open actions', async () => {
    const { container } = renderCell({ locked: true, lockReason: 'cap' });

    const lock = screen.getByTestId('smart-link-locked-release-1');
    expect(lock).toHaveTextContent('Smart link (Pro)');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('/smart/release-1')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows a scheduled lock for an unreleased release', async () => {
    const { container } = renderCell({ locked: true, lockReason: 'scheduled' });

    expect(screen.getByTestId('smart-link-locked-release-1')).toHaveTextContent(
      'Scheduled'
    );
    expect(screen.queryByText('Smart link (Pro)')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
