import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import {
  DashboardDataProvider,
  useDashboardData,
} from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsSearchabilitySection } from '@/components/features/dashboard/organisms/SettingsSearchabilitySection';
import type { Artist } from '@/types/db';

const { save, hook } = vi.hoisted(() => ({ save: vi.fn(), hook: vi.fn() }));
vi.mock('@/lib/queries/useSettingsMutation', () => ({
  useUpdateSettingsMutation: (options: unknown) => {
    hook(options);
    return { mutateAsync: save };
  },
}));

function artist(id = 'profile-a', searchable?: boolean): Artist {
  return {
    id,
    owner_user_id: 'owner',
    handle: id,
    name: 'Artist',
    spotify_id: '',
    published: true,
    settings: searchable === undefined ? {} : { searchable },
  } as Artist;
}

beforeEach(() => vi.clearAllMocks());

function PrivacyPageFixture() {
  const { selectedProfile } = useDashboardData();
  return selectedProfile ? (
    <SettingsSearchabilitySection
      artist={{
        ...artist(selectedProfile.id),
        settings: selectedProfile.settings,
      }}
    />
  ) : null;
}

describe('owner discovery choice', () => {
  it.each([true, false])(
    'retains the saved choice after navigating away from an initially %s profile',
    async initial => {
      save.mockResolvedValue({});
      const profile = {
        id: 'profile-a',
        settings: { searchable: initial },
      } as DashboardData['creatorProfiles'][number];
      const data: DashboardData = {
        user: { id: 'owner' },
        creatorProfiles: [profile],
        selectedProfile: profile,
        needsOnboarding: false,
        sidebarCollapsed: false,
        hasSocialLinks: false,
        hasMusicLinks: false,
        isAdmin: false,
        tippingStats: {
          tipClicks: 0,
          qrTipClicks: 0,
          linkTipClicks: 0,
          tipsSubmitted: 0,
          totalReceivedCents: 0,
          monthReceivedCents: 0,
        },
        profileCompletion: {
          percentage: 0,
          completedCount: 0,
          totalCount: 0,
          steps: [],
          profileIsLive: false,
        },
      };
      const page = (visible: boolean) => (
        <DashboardDataProvider value={data}>
          {visible ? <PrivacyPageFixture /> : null}
        </DashboardDataProvider>
      );
      const { rerender } = render(page(true));
      fireEvent.click(screen.getByRole('switch'));
      await screen.findByText('Saved');
      rerender(page(false));
      rerender(page(true));
      if (initial) {
        expect(screen.getByRole('switch')).not.toBeChecked();
      } else {
        expect(screen.getByRole('switch')).toBeChecked();
      }
      fireEvent.click(screen.getByRole('switch'));
      await waitFor(() =>
        expect(save).toHaveBeenLastCalledWith({
          updates: { settings: { searchable: initial } },
        })
      );
    }
  );

  it('preserves the legacy choice and explains direct public sharing for humans and bots', () => {
    render(<SettingsSearchabilitySection artist={artist()} />);
    expect(
      screen.getByRole('switch', { name: 'Show in Jovie discovery' })
    ).toBeChecked();
    expect(
      screen.getByText(
        /anyone with your public URL can still view it, including bots/
      )
    ).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    expect(hook).toHaveBeenLastCalledWith({
      profileId: 'profile-a',
      silentSuccess: true,
    });
  });

  it('saves only explicit consent, keeps the focused switch in place, and reserves the status slot', async () => {
    let resolve!: () => void;
    save.mockReturnValue(
      new Promise<void>(r => {
        resolve = r;
      })
    );
    const update = vi.fn();
    render(
      <SettingsSearchabilitySection artist={artist()} onArtistUpdate={update} />
    );
    const control = screen.getByRole('switch', {
      name: 'Show in Jovie discovery',
    });
    const status = document.querySelector('[aria-live="polite"]');
    control.focus();
    fireEvent.click(control);
    expect(control).not.toBeChecked();
    expect(control).toBeDisabled();
    expect(status).toHaveAttribute('data-state', 'saving');
    expect(status).toHaveClass('min-h-4');
    expect(save).toHaveBeenCalledWith({
      updates: { settings: { searchable: false } },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'profile-a',
        published: true,
        settings: { searchable: false },
      })
    );
    await act(async () => resolve());
    expect(control).toBeEnabled();
    expect(control).toHaveFocus();
    expect(document.querySelector('[aria-live="polite"]')).toBe(status);
    expect(status).toHaveAttribute('data-state', 'saved');
  });

  it('rolls back a failed save and allows retry without changing publication or contact choices', async () => {
    save.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    const update = vi.fn();
    render(
      <SettingsSearchabilitySection
        artist={{ ...artist(), settings: { require_double_opt_in: true } }}
        onArtistUpdate={update}
      />
    );
    const control = screen.getByRole('switch', {
      name: 'Show in Jovie discovery',
    });
    fireEvent.click(control);
    await waitFor(() => expect(control).toBeEnabled());
    expect(control).toBeChecked();
    expect(
      screen.getByText('Could not save discovery preference. Try again.')
    ).toBeVisible();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        published: true,
        settings: { searchable: true, require_double_opt_in: true },
      })
    );
    fireEvent.click(control);
    await waitFor(() => expect(screen.getByText('Saved')).toBeVisible());
    expect(control).not.toBeChecked();
  });

  it('supports native keyboard activation and retains the initiating focus', async () => {
    save.mockResolvedValue({});
    const user = userEvent.setup();
    render(<SettingsSearchabilitySection artist={artist('keyboard', false)} />);
    const control = screen.getByRole('switch');
    await user.tab();
    expect(control).toHaveFocus();
    await user.keyboard(' ');
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        updates: { settings: { searchable: true } },
      })
    );
    expect(control).toBeChecked();
    expect(control).toHaveFocus();
  });

  it('does not apply an old failure after the selected profile changes', async () => {
    let reject!: (error: Error) => void;
    save.mockReturnValue(
      new Promise<void>((_, r) => {
        reject = r;
      })
    );
    const update = vi.fn();
    const { rerender } = render(
      <SettingsSearchabilitySection artist={artist()} onArtistUpdate={update} />
    );
    fireEvent.click(screen.getByRole('switch'));
    rerender(
      <SettingsSearchabilitySection
        artist={artist('profile-b', false)}
        onArtistUpdate={update}
      />
    );
    expect(screen.getByRole('switch')).not.toBeChecked();
    await act(async () => reject(new Error('late failure')));
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(update).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenLastCalledWith({
      profileId: 'profile-b',
      silentSuccess: true,
    });
  });
});
