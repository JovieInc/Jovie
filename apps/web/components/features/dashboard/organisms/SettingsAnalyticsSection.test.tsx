import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';

const { updateAnalyticsFilterAsync } = vi.hoisted(() => ({
  updateAnalyticsFilterAsync: vi.fn<(enabled: boolean) => Promise<unknown>>(),
}));

const checkout = await vi.hoisted(async () => {
  const { createUpgradeCheckoutFixture } = await import(
    '@/tests/fixtures/upgrade-checkout'
  );
  return createUpgradeCheckoutFixture();
});

vi.mock('@/lib/analytics', () => ({
  track: checkout.track,
  useFeatureFlag: () => true,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: checkout.push }),
}));
vi.mock('@/components/feedback', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/queries', () => ({
  useAnalyticsFilterMutation: () => ({ updateAnalyticsFilterAsync }),
  useCheckoutMutation: () => ({
    mutate: checkout.mutate,
    reset: checkout.reset,
    isPending: false,
    error: null,
  }),
  usePricingOptionsQuery: () => checkout.pricing,
}));

import { SettingsAnalyticsSection } from './SettingsAnalyticsSection';

const artist = {
  id: 'profile-1',
  settings: { exclude_self_from_analytics: false },
} as Artist;

function renderSection(
  props: Partial<React.ComponentProps<typeof SettingsAnalyticsSection>> = {},
  dir?: 'rtl'
) {
  const onArtistUpdate = vi.fn();
  const result = render(
    <TooltipProvider>
      <div dir={dir}>
        <SettingsAnalyticsSection
          artist={artist}
          onArtistUpdate={onArtistUpdate}
          {...props}
        />
      </div>
    </TooltipProvider>
  );
  return { ...result, onArtistUpdate };
}

function toggle() {
  return screen.getByRole('switch', { name: 'Traffic Quality Filtering' });
}

beforeEach(() => {
  updateAnalyticsFilterAsync.mockReset();
});

describe('SettingsAnalyticsSection', () => {
  it('saves the filter optimistically and confirms it', async () => {
    const user = userEvent.setup();
    updateAnalyticsFilterAsync.mockResolvedValue({ ok: true });
    const { container, onArtistUpdate } = renderSection();
    expect(screen.getByText('All traffic')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(toggle());

    expect(updateAnalyticsFilterAsync).toHaveBeenCalledWith(true);
    expect(onArtistUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          exclude_self_from_analytics: true,
        }),
      })
    );
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('High quality only')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('disables the toggle while the save is pending', async () => {
    const user = userEvent.setup();
    updateAnalyticsFilterAsync.mockReturnValue(new Promise(() => {}));
    const { container } = renderSection();

    await user.click(toggle());

    expect(await screen.findByText('Saving…')).toBeInTheDocument();
    expect(toggle()).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it.each([
    ['a rejected save', new Error('Save failed')],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('rolls back and reports %s', async (_label, error) => {
    const user = userEvent.setup();
    updateAnalyticsFilterAsync.mockRejectedValue(error);
    const { container, onArtistUpdate } = renderSection();

    await user.click(toggle());

    await waitFor(() =>
      expect(toggle()).toHaveAttribute('aria-checked', 'false')
    );
    expect(onArtistUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          exclude_self_from_analytics: false,
        }),
      })
    );
    expect(
      container.querySelector('[data-state="error"][aria-live="polite"]')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('starts off when the profile never stored the filter', async () => {
    const { container } = renderSection({
      artist: { ...artist, settings: {} } as Artist,
    });

    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    await expectNoA11yViolations(container);
  });

  it('shows the plan gate instead of the toggle on a free plan', async () => {
    const { container } = renderSection({ isPro: false });

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Upgrade to/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = renderSection(
      {
        artist: {
          ...artist,
          settings: { exclude_self_from_analytics: true },
        } as Artist,
      },
      'rtl'
    );

    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    await expectNoA11yViolations(container);
  });
});
