import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentPropsWithoutRef, forwardRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BannerViewport } from '@/components/feedback/BannerViewport';
import { banner } from '@/components/feedback/banner-store';
import {
  SidebarDock,
  type SidebarDockProps,
  sidebarDockSeenKey,
} from './SidebarDock';

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
const update = {
  state: 'available',
  version: '2',
  releaseDate: null,
  notesUrl: '/changelog',
} as const;
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
function CollapsibleDockFixture() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <button type='button' onClick={() => setCollapsed(true)}>
        Collapse sidebar
      </button>
      <SidebarDock userId='one' release={release} collapsed={collapsed} />
      <button type='button' data-slot='common-dropdown-trigger'>
        Account
      </button>
    </div>
  );
}

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
    mask => {
      const { container } = render(
        <SidebarDock
          userId='one'
          update={mask & 4 ? update : undefined}
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
    }
  );

  it('keeps one compact notice above playback and routes every disclosed action', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <SidebarDock
        userId='one'
        update={update}
        onUpdate={onUpdate}
        release={release}
        audio={audio}
        install={install}
      />
    );
    expect(cards(container)).toEqual(['update', 'now-playing']);
    fireEvent.click(screen.getByRole('button', { name: 'Update available' }));
    expect(onUpdate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update' }));
    expect(cards(container)).toEqual(['whats-new', 'now-playing']);
    fireEvent.click(screen.getByRole('button', { name: "What's New" }));
    fireEvent.click(screen.getByRole('button', { name: "Dismiss what's new" }));
    expect(cards(container)).toEqual(['install', 'now-playing']);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Player' }));
    expect(audio.onDismiss).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Install Jovie' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(install.onInstall).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss install prompt' })
    );
    expect(install.onDismiss).toHaveBeenCalledOnce();
  });

  it('yields install/update/release to a canonical permission notice without discarding them', () => {
    const { container } = render(
      <>
        <BannerViewport />
        <SidebarDock
          userId='one'
          update={update}
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
    fireEvent.click(screen.getByRole('button', { name: "What's New" }));
    fireEvent.click(screen.getByRole('button', { name: "Dismiss what's new" }));
    expect(localStorage.getItem(sidebarDockSeenKey('one'))).toBe(release.id);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<SidebarDock userId='two' release={release} />);
    fireEvent.click(screen.getByRole('button', { name: "What's New" }));
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
    fireEvent.click(screen.getByRole('button', { name: "What's New" }));
    fireEvent.click(screen.getByRole('link'));
    expect(localStorage.getItem(sidebarDockSeenKey('one'))).toBe('newer');
  });

  it.each<NonNullable<SidebarDockProps['update']>>([
    {
      state: 'downloading',
      percent: 42,
      transferredBytes: 42,
      totalBytes: 100,
      bytesPerSecond: 1,
    },
    { state: 'ready', version: '2' },
  ])('keeps $state undismissable in one quiet row', updateState => {
    render(<SidebarDock userId='one' update={updateState} />);
    expect(screen.queryByRole('button', { name: 'Dismiss update' })).toBeNull();
    expect(
      screen.getByText(
        updateState.state === 'ready' ? 'Restart to update' : 'Downloading 42%'
      )
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Collapse update|Expand update/ })
    ).toBeNull();
    expect(screen.queryByText('Open update details.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss update' })).toBeNull();
  });

  it('allows available-version dismissal without hiding a downloading update', () => {
    const { rerender } = render(<SidebarDock userId='one' update={update} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update' }));
    expect(screen.queryByText('Update available')).toBeNull();
    rerender(
      <SidebarDock
        userId='one'
        update={{
          state: 'downloading',
          percent: 42,
          transferredBytes: 42,
          totalBytes: 100,
          bytesPerSecond: 1,
        }}
      />
    );
    expect(screen.getByText('Downloading 42%')).toBeVisible();
  });

  it.each(['unsupported', 'idle', 'checking', 'not-available'] as const)(
    'has no card for updater %s',
    state => {
      const { container } = render(
        <SidebarDock userId='one' update={{ state }} />
      );
      expect(cards(container)).toEqual([]);
    }
  );

  it('keeps update recovery reachable', () => {
    const onUpdate = vi.fn();
    render(
      <SidebarDock
        userId='one'
        onUpdate={onUpdate}
        update={{ state: 'error', message: 'Offline', retryable: true }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update failed' }));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Update failed' })).toBeVisible();
    expect(screen.queryByText('Open update details to try again.')).toBeNull();
  });

  it('combines collapsed status into one priority symbol with unread detail', () => {
    const { container, rerender } = render(
      <SidebarDock
        userId='one'
        collapsed
        update={update}
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
    ).toEqual(['update']);
    expect(container.querySelector('[data-dock-unread]')).not.toBeNull();
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

  it('reveals release details without marking them read and closes with Escape', async () => {
    render(
      <SidebarDock
        userId='one'
        release={{ ...release, summary: 'A quieter workspace.' }}
      />
    );
    const trigger = screen.getByRole('button', {
      name: "What's New",
    });
    expect(screen.queryByText(release.title)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: "What's New" })).toBeVisible();
    expect(screen.getByText('A quieter workspace.')).toBeVisible();
    expect(localStorage.getItem(sidebarDockSeenKey('one'))).toBeNull();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('moves focus to recovery when a priority update replaces open release details', async () => {
    const { rerender } = render(<SidebarDock userId='one' release={release} />);
    fireEvent.click(screen.getByRole('button', { name: "What's New" }));
    screen.getByRole('link', { name: 'View Changes' }).focus();
    rerender(
      <SidebarDock
        userId='one'
        release={release}
        update={{ state: 'error', message: 'Offline', retryable: true }}
      />
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Update failed' })
      ).toHaveFocus()
    );
  });

  it.each(['pointer', 'same-task'] as const)(
    'preserves deliberate outside focus when %s input removes the popover trigger',
    async input => {
      const user = userEvent.setup();
      render(<CollapsibleDockFixture />);
      await user.click(screen.getByRole('button', { name: "What's New" }));
      expect(screen.getByRole('dialog', { name: "What's New" })).toBeVisible();
      const outside = screen.getByRole('button', { name: 'Collapse sidebar' });
      if (input === 'pointer') {
        await user.click(outside);
      } else {
        act(() => {
          outside.focus();
          outside.click();
        });
      }
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      // Flush deferred focus recovery before asserting the outside target.
      await act(async () => {
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      expect(outside).toHaveFocus();
    }
  );

  it('reserves the audio slot without a duplicate transport while the full player is visible', () => {
    const { container } = render(
      <SidebarDock userId='one' audio={{ ...audio, reserved: true }} />
    );
    expect(
      container.querySelector('[data-dock-card="now-playing"]')
    ).toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it.each([false, true])(
    'returns keyboard focus after dismissal with reserved audio=%s',
    async reservedAudio => {
      render(
        <div>
          <SidebarDock
            userId='one'
            release={release}
            audio={reservedAudio ? { ...audio, reserved: true } : undefined}
          />
          <button type='button' data-slot='common-dropdown-trigger'>
            Account
          </button>
        </div>
      );
      fireEvent.click(screen.getByRole('button', { name: "What's New" }));
      const dismiss = screen.getByRole('button', {
        name: "Dismiss what's new",
      });
      dismiss.focus();
      fireEvent.click(dismiss);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Account' })).toHaveFocus()
      );
    }
  );

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
    fireEvent.click(screen.getByRole('button', { name: "What's New" }));
    fireEvent.click(screen.getByRole('button', { name: "Dismiss what's new" }));
    expect(screen.queryByRole('link')).toBeNull();
    get.mockRestore();
    set.mockRestore();
  });
});
