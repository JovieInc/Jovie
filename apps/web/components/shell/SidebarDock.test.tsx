import { checkTooltipCopy } from '@jovie/copy/tooltip-copy';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BannerViewport } from '@/components/feedback/BannerViewport';
import { banner } from '@/components/feedback/banner-store';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SidebarDock,
  type SidebarDockProps,
  sidebarDockSeenKey,
} from './SidebarDock';
import { Tooltip } from './Tooltip';

// Expose the Next Link contract without starting a router in jsdom.
vi.mock('next/link', () => ({
  default: forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

const release = {
  id: '2026-10-15',
  title: 'Your latest releases',
  date: '2026-10-15',
  summary: '',
  url: '/changelog',
  highlights: [],
  dogfood: [],
};
const control = (
  overrides: Partial<NonNullable<SidebarDockProps['updateControl']>> = {}
): NonNullable<SidebarDockProps['updateControl']> => ({
  visible: true,
  label: 'Update available',
  urgent: false,
  node: <button type='button'>Slotted control</button>,
  ...overrides,
});
const update = control();
const audio = {
  track: {
    trackTitle: 'Never Say A Word',
    artistName: 'Tim White',
    artworkUrl: null,
  },
  isPlaying: true,
  onPlay: vi.fn(),
  onDismiss: vi.fn(),
};
const install = { onInstall: vi.fn(), onDismiss: vi.fn() };
const cards = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-dock-card]')].map(card =>
    card.getAttribute('data-dock-card')
  );

beforeEach(() => {
  banner.dismiss();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('SidebarDock', () => {
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    'keeps fixed order for combination %i',
    async mask => {
      const { container } = render(
        <SidebarDock
          userId='one'
          updateControl={mask & 4 ? update : undefined}
          release={mask & 2 ? release : null}
          audio={mask & 1 ? audio : undefined}
        />
      );
      expect(cards(container)).toEqual(
        [
          mask & 4 ? 'update' : null,
          !(mask & 4) && mask & 2 ? 'whats-new' : null,
          mask & 1 ? 'now-playing' : null,
        ].filter(Boolean)
      );
      await expectNoA11yViolations(container);
    }
  );

  it('puts install last and routes all actions', async () => {
    const { container, rerender } = render(
      <SidebarDock
        userId='one'
        updateControl={update}
        release={release}
        audio={audio}
        install={install}
      />
    );
    expect(cards(container)).toEqual(['update', 'now-playing']);
    await expectNoA11yViolations(container);
    // The update has no dismiss: it leaves only when the updater is done.
    rerender(
      <SidebarDock
        userId='one'
        updateControl={control({ visible: false, label: null, node: null })}
        release={release}
        audio={audio}
        install={install}
      />
    );
    expect(cards(container)).toEqual(['whats-new', 'now-playing']);
    fireEvent.click(screen.getByRole('button', { name: "Dismiss what's new" }));
    expect(cards(container)).toEqual(['now-playing', 'install']);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Player' }));
    expect(audio.onDismiss).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(install.onInstall).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Prompt' }));
    expect(install.onDismiss).toHaveBeenCalledOnce();
  });

  it('yields install/update/release to a canonical permission notice without discarding them', () => {
    const { container } = render(
      <>
        <BannerViewport />
        <SidebarDock
          userId='one'
          updateControl={update}
          release={release}
          install={install}
        />
      </>
    );
    act(() => {
      banner.warning('Allow notifications', {
        id: 'permission',
        action: { label: 'Review', onClick: vi.fn() },
      });
    });
    expect(cards(container)).toEqual([]);
    expect(screen.getAllByTestId('app-banner')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Review' })).toBeVisible();
    act(() => {
      banner.dismiss('permission');
    });
    expect(cards(container)).toEqual(['update']);
    expect(screen.queryByTestId('app-banner')).toBeNull();
  });

  it('persists the release per user and shows a newer release', () => {
    const { rerender, unmount } = render(
      <SidebarDock userId='one' release={release} />
    );
    fireEvent.click(screen.getByRole('button', { name: "Dismiss what's new" }));
    expect(localStorage.getItem(sidebarDockSeenKey('one'))).toBe(release.id);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<SidebarDock userId='two' release={release} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/changelog');
    expect(screen.getByRole('link')).toHaveAttribute('data-prefetch', 'false');
    rerender(<SidebarDock userId='one' release={release} />);
    expect(screen.queryByRole('link')).toBeNull();
    unmount();
    const next = render(<SidebarDock userId='one' release={release} />);
    expect(screen.queryByRole('link')).toBeNull();
    next.rerender(
      <SidebarDock userId='one' release={{ ...release, id: 'newer' }} />
    );
    fireEvent.click(screen.getByRole('link'));
    expect(localStorage.getItem(sidebarDockSeenKey('one'))).toBe('newer');
  });

  describe('update control slot', () => {
    it('gives the control a fixed row and no chrome of its own', async () => {
      const { container } = render(
        <SidebarDock userId='one' updateControl={control()} />
      );
      expect(cards(container)).toEqual(['update']);
      const card = container.querySelector('[data-dock-card="update"]');
      // The panel's fixed 32px row holds the control while its chunk loads.
      expect(card?.querySelector('[data-dock-update-slot]')).toHaveClass('h-8');
      expect(card?.children).toHaveLength(1);
      // The control is the card's only button: no collapse, no dismiss.
      expect(screen.getAllByRole('button')).toEqual([
        screen.getByRole('button', { name: 'Slotted control' }),
      ]);
      await expectNoA11yViolations(container);
    });

    it('has no card while the control is hidden or absent', () => {
      const { container, rerender } = render(
        <SidebarDock
          userId='one'
          updateControl={control({ visible: false, label: null, node: null })}
        />
      );
      expect(cards(container)).toEqual([]);
      rerender(<SidebarDock userId='one' />);
      expect(cards(container)).toEqual([]);
    });

    it('keeps the card mounted while the control changes state', () => {
      const { container, rerender } = render(
        <SidebarDock userId='one' updateControl={control()} />
      );
      const card = container.querySelector('[data-dock-card="update"]');
      rerender(
        <SidebarDock
          userId='one'
          updateControl={control({ label: 'Update failed', urgent: true })}
        />
      );
      expect(container.querySelector('[data-dock-card="update"]')).toBe(card);
    });

    it('lets a failed update outrank a permission notice', () => {
      banner.show({ id: 'permission', title: 'Permission', priority: 900 });
      const { container, rerender } = render(
        <SidebarDock userId='one' updateControl={control()} />
      );
      expect(cards(container)).toEqual([]);
      rerender(
        <SidebarDock
          userId='one'
          updateControl={control({ label: 'Update failed', urgent: true })}
        />
      );
      expect(cards(container)).toEqual(['update']);
    });

    it('names the collapsed rail badge from the control', () => {
      render(
        <SidebarDock
          userId='one'
          collapsed
          updateControl={control({ label: 'Restart to update' })}
        >
          {status => (
            <button type='button' aria-label={status?.label}>
              {status?.badges}
            </button>
          )}
        </SidebarDock>
      );
      expect(screen.getByRole('button')).toHaveAccessibleName(
        'Restart to update'
      );
    });
  });

  it('shows audio with only a track title', async () => {
    const onPlay = vi.fn();
    const { container } = render(
      <SidebarDock
        userId='one'
        audio={{
          ...audio,
          onPlay,
          track: {
            trackTitle: 'Untitled demo',
            artistName: null,
            artworkUrl: null,
          },
        }}
      />
    );
    expect(cards(container)).toEqual(['now-playing']);
    expect(screen.getByText('Untitled demo')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPlay).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('keeps long release and track titles reachable', async () => {
    const title =
      'Release pages now show every streaming service, presave countdowns and per-territory analytics';
    const trackTitle =
      'Midnight Drive Through the Neon City (Extended Club Mix featuring the Late Night Strings)';
    const { container } = render(
      <SidebarDock
        userId='one'
        release={{ ...release, title }}
        audio={{
          ...audio,
          track: { ...audio.track, trackTitle },
        }}
      />
    );
    expect(cards(container)).toEqual(['whats-new', 'now-playing']);
    expect(screen.getByText(title)).toHaveClass('truncate');
    expect(screen.getByText(trackTitle)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the update control reachable in a right-to-left sidebar', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SidebarDock
          userId='one'
          updateControl={update}
          audio={{
            ...audio,
            track: {
              trackTitle: 'ليالي المدينة الطويلة',
              artistName: 'فرقة الشرق',
              artworkUrl: null,
            },
          }}
        />
      </div>
    );
    expect(screen.getByText('ليالي المدينة الطويلة')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Slotted control' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('collapses cards to named user-button badges', () => {
    const { container, rerender } = render(
      <SidebarDock
        userId='one'
        collapsed
        updateControl={update}
        release={release}
        audio={audio}
        install={install}
      >
        {status => (
          <button type='button' aria-label={status?.label}>
            {status?.badges}
          </button>
        )}
      </SidebarDock>
    );
    expect(cards(container)).toEqual([]);
    expect(
      [...container.querySelectorAll('[data-dock-badge]')].map(node =>
        node.getAttribute('data-dock-badge')
      )
    ).toEqual(['update', 'whats-new', 'audio', 'install']);
    expect(screen.getByRole('button')).toHaveAccessibleName(
      "Update available · What's new: Your latest releases · Playing: Never Say A Word · Install Jovie"
    );
    rerender(
      <SidebarDock userId='one' collapsed>
        {status => <button type='button'>{status?.badges}</button>}
      </SidebarDock>
    );
    expect(container.querySelector('[data-dock-badges]')).toBeNull();
  });

  // Founder report: the sidebar opened, the status tooltip armed, the sidebar
  // collapsed, and the tooltip stayed up with no pointer on it. UserButton
  // wires the dock status exactly like this harness.
  describe('status tooltip across collapse', () => {
    const qrNote =
      'Profile QR codes are now drawn right on your device. Visiting a profile no longer reaches an outside service to render them, so pages load with zero third-party requests, keeping the promise we publish on our comparison page.';
    const Dock = ({ collapsed }: { readonly collapsed: boolean }) => (
      <SidebarDock
        userId='one'
        collapsed={collapsed}
        release={{ ...release, title: qrNote }}
      >
        {status => (
          <Tooltip
            label={status?.label ?? 'Open user menu'}
            side='right'
            open={status ? undefined : false}
          >
            <button type='button'>Account</button>
          </Tooltip>
        )}
      </SidebarDock>
    );
    const tooltip = () => screen.queryByRole('tooltip');
    const settle = () => act(async () => {});

    it('never leaves the tooltip up after the sidebar collapses', async () => {
      const { rerender } = render(<Dock collapsed={false} />);
      const trigger = screen.getByRole('button', { name: 'Account' });

      // Sidebar open: hover arms the tooltip, then the pointer leaves.
      fireEvent.focus(trigger);
      await settle();
      expect(tooltip()).not.toBeInTheDocument();
      fireEvent.blur(trigger);
      await settle();

      rerender(<Dock collapsed />);
      await settle();
      expect(tooltip()).not.toBeInTheDocument();
    });

    it('closes when collapsed flips, even with focus still on the trigger', async () => {
      const { rerender } = render(<Dock collapsed />);
      const trigger = screen.getByRole('button', { name: 'Account' });
      fireEvent.focus(trigger);
      expect(await screen.findByRole('tooltip')).toBeInTheDocument();

      rerender(<Dock collapsed={false} />);
      await settle();
      expect(tooltip()).not.toBeInTheDocument();
      rerender(<Dock collapsed />);
      await settle();
      expect(tooltip()).not.toBeInTheDocument();

      // Fresh intent still works.
      fireEvent.blur(trigger);
      fireEvent.focus(trigger);
      expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    });

    it('shows a short title, not the changelog paragraph', async () => {
      render(<Dock collapsed />);
      fireEvent.focus(screen.getByRole('button', { name: 'Account' }));
      const label = "What's new: Profile QR codes are now drawn…";
      expect(await screen.findByRole('tooltip')).toHaveTextContent(label);
      expect(checkTooltipCopy(label)).toEqual([]);
    });
  });

  it('reserves the audio slot without a duplicate transport while the full player is visible', () => {
    const { container } = render(
      <SidebarDock userId='one' audio={{ ...audio, reserved: true }} />
    );
    expect(
      container.querySelector('[data-dock-card="now-playing"]')
    ).toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('returns keyboard focus after dismissing a card', async () => {
    render(
      <div>
        <SidebarDock userId='one' release={release} />
        <button type='button' data-slot='common-dropdown-trigger'>
          Account
        </button>
      </div>
    );
    const dismiss = screen.getByRole('button', { name: "Dismiss what's new" });
    dismiss.focus();
    fireEvent.click(dismiss);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Account' })).toHaveFocus()
    );
  });

  it('dismisses in memory when browser storage is unavailable', () => {
    const get = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const set = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    render(<SidebarDock userId='one' release={release} />);
    fireEvent.click(screen.getByRole('button', { name: "Dismiss what's new" }));
    expect(screen.queryByRole('link')).toBeNull();
    get.mockRestore();
    set.mockRestore();
  });
  it('measures card positions only when the card stack changes', () => {
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const { rerender } = render(<SidebarDock userId='one' audio={audio} />);
    const mounted = measure.mock.calls.length;
    expect(mounted).toBeGreaterThan(0);
    rerender(
      <SidebarDock userId='one' audio={{ ...audio, isPlaying: false }} />
    );
    expect(measure.mock.calls.length).toBe(mounted);
    rerender(<SidebarDock userId='one' audio={audio} updateControl={update} />);
    expect(measure.mock.calls.length).toBeGreaterThan(mounted);
    measure.mockRestore();
  });
});
