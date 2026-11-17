import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichmentStatus } from '@/lib/queries/useDspEnrichmentStatusQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DspPresenceSummary } from './DspPresenceSummary';

const hoisted = vi.hoisted(() => ({
  triggerDiscovery: vi.fn(),
  isPending: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/queries/useDspEnrichmentMutations', () => ({
  useTriggerDiscoveryMutation: () => ({
    mutate: hoisted.triggerDiscovery,
    isPending: hoisted.isPending,
  }),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: hoisted.toastSuccess, error: hoisted.toastError },
}));

vi.mock('@/features/dashboard/atoms/DrawerToggleButton', () => ({
  DrawerToggleButton: ({ ariaLabel }: { readonly ariaLabel: string }) => (
    <button type='button' aria-label={ariaLabel} />
  ),
}));

const discovering = {
  overallPhase: 'discovering',
} as unknown as EnrichmentStatus;

function renderSummary(
  props: Partial<ComponentProps<typeof DspPresenceSummary>> = {}
) {
  const onAddPlatform = vi.fn();
  const view = render(
    <TooltipProvider>
      <DspPresenceSummary
        confirmedCount={3}
        suggestedCount={0}
        profileId='profile-1'
        onAddPlatform={onAddPlatform}
        {...props}
      />
    </TooltipProvider>
  );
  return { ...view, onAddPlatform };
}

describe('DspPresenceSummary', () => {
  beforeEach(() => {
    hoisted.triggerDiscovery.mockReset();
    hoisted.toastSuccess.mockReset();
    hoisted.toastError.mockReset();
    hoisted.isPending = false;
  });

  it('counts matched platforms and opens the add platform flow', async () => {
    const user = userEvent.setup();
    const { container, onAddPlatform } = renderSummary();

    expect(screen.getByText(/3 matched platform/)).toHaveTextContent(
      '3 matched platforms'
    );
    await user.click(screen.getByRole('button', { name: 'Add platform' }));

    expect(onAddPlatform).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /Re-scan|Spotify|Discovery/ })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('uses the singular for one platform and shows pending matches with the warning token', async () => {
    const { container } = renderSummary({
      confirmedCount: 1,
      suggestedCount: 2,
    });

    expect(screen.getByText(/1 matched platform/)).toHaveTextContent(
      /^1 matched platform$/
    );
    expect(screen.getByText(/2 pending/)).toBeInTheDocument();
    expect(container.querySelector('.bg-warning')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('starts discovery for admins and toasts on success and failure', async () => {
    const user = userEvent.setup();
    hoisted.triggerDiscovery.mockImplementation(
      (
        _vars: unknown,
        opts: { onSuccess: () => void; onError: () => void }
      ) => {
        opts.onSuccess();
        opts.onError();
      }
    );
    const { container } = renderSummary({ isAdmin: true, spotifyId: 'sp-1' });

    await user.click(
      screen.getByRole('button', { name: 'Re-scan streaming platforms' })
    );

    expect(hoisted.triggerDiscovery).toHaveBeenCalledWith(
      { profileId: 'profile-1', spotifyArtistId: 'sp-1' },
      expect.any(Object)
    );
    expect(hoisted.toastSuccess).toHaveBeenCalledWith(
      'Discovery started, new profiles will appear shortly'
    );
    expect(hoisted.toastError).toHaveBeenCalledWith(
      'Failed to trigger discovery'
    );
    await expectNoA11yViolations(container);
  });

  it('disables refresh until Spotify is connected', () => {
    renderSummary({ isAdmin: true, spotifyId: null });
    expect(
      screen.getByRole('button', {
        name: 'Connect Spotify first to enable discovery',
      })
    ).toBeDisabled();
  });

  it('shows the discovery phase in the info token while discovery runs', async () => {
    const { container } = renderSummary({
      isAdmin: true,
      spotifyId: 'sp-1',
      enrichmentStatus: discovering,
    });

    expect(
      screen.getByRole('button', { name: 'Discovery in progress...' })
    ).toBeDisabled();
    expect(container.querySelector('.text-info')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('disables refresh while the discovery request is pending', () => {
    hoisted.isPending = true;
    renderSummary({ isAdmin: true, spotifyId: 'sp-1' });
    expect(
      screen.getByRole('button', { name: 'Re-scan streaming platforms' })
    ).toBeDisabled();
  });
});
