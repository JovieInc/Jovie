import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileDrawerShell } from '@/components/features/profile/ProfileDrawerShell';
import type { ProfileSurfacePresentation } from '@/features/profile/contracts';
import { ProfileUnifiedDrawer } from '@/features/profile/ProfileUnifiedDrawer';
import { MenuView } from '@/features/profile/views/MenuView';
import type { ShareContext } from '@/lib/share/types';
import { mockArtist } from '@/lib/test-utils/mock-data';

vi.mock('vaul', () => {
  const Pass = ({ children }: { readonly children: ReactNode }) => children;
  return {
    Drawer: {
      Root: (props: {
        readonly children: ReactNode;
        readonly open?: boolean;
      }) => (props.open === false ? null : props.children),
      Portal: Pass,
      Overlay: (props: Record<string, unknown>) => <div {...props} />,
      Content: (props: Record<string, unknown>) => (
        <div role='dialog' aria-modal='true' tabIndex={-1} {...props} />
      ),
      Title: Pass,
      Description: Pass,
    },
  };
});

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/features/share/PublicShareMenu', () => ({
  PublicShareActionList: () => <div>Share destinations</div>,
}));

const VIEWPORTS = [
  { label: 'mobile', width: 390, presentation: 'standalone' as const },
  { label: 'tablet', width: 768, presentation: 'embedded' as const },
  { label: 'desktop', width: 1280, presentation: 'modal' as const },
] as const;

const CAPABILITY_FIXTURES = [
  {
    name: 'Share only',
    hasTip: false,
    hasContacts: false,
    visible: ['Share Profile'],
    hidden: ['Pay', 'Contact'],
  },
  {
    name: 'payment enabled',
    hasTip: true,
    hasContacts: false,
    visible: ['Share Profile', 'Pay'],
    hidden: ['Contact'],
  },
  {
    name: 'contact',
    hasTip: false,
    hasContacts: true,
    visible: ['Share Profile', 'Contact'],
    hidden: ['Pay'],
  },
  {
    name: 'all capabilities',
    hasTip: true,
    hasContacts: true,
    visible: ['Share Profile', 'Pay', 'Contact'],
    hidden: [] as string[],
  },
];

const drawerProps = {
  onOpenChange: vi.fn(),
  view: 'menu' as const,
  onViewChange: vi.fn(),
  artist: mockArtist,
  socialLinks: [],
  contacts: [],
  primaryChannel: () => ({
    type: 'email' as const,
    encoded: 'enc',
    preferred: true,
  }),
  dsps: [],
  isSubscribed: false,
  contentPrefs: { newMusic: true, tourDates: true, merch: true, general: true },
  onTogglePref: vi.fn(),
  onUnsubscribe: vi.fn(),
  isUnsubscribing: false,
  hasTip: false,
  hasContacts: false,
  hasTourDates: false,
  hasReleases: false,
  shareContext: {} as ShareContext,
};

function MenuShell({
  open = true,
  presentation,
  onOpenChange = vi.fn(),
  children = <button type='button'>Share Profile</button>,
}: {
  readonly open?: boolean;
  readonly presentation: ProfileSurfacePresentation;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children?: ReactNode;
}) {
  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title='Menu'
      presentation={presentation}
      dataTestId='profile-menu-drawer'
    >
      {children}
    </ProfileDrawerShell>
  );
}

function OpenShell({
  presentation,
  onOpenChange,
}: {
  readonly presentation: ProfileSurfacePresentation;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type='button' onClick={() => setOpen(true)}>
        Open menu
      </button>
      <MenuShell
        open={open}
        presentation={presentation}
        onOpenChange={next => {
          onOpenChange?.(next);
          setOpen(next);
        }}
      >
        <button type='button'>Share Profile</button>
        <button type='button'>Pay</button>
      </MenuShell>
    </div>
  );
}

function renderOpenShell(
  presentation: ProfileSurfacePresentation,
  onOpenChange = vi.fn()
) {
  return render(
    <MenuShell presentation={presentation} onOpenChange={onOpenChange} />
  );
}

function resetScrollLock() {
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('overscroll-behavior');
  document.documentElement.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overscroll-behavior');
}

describe('ProfileDrawerShell keyboard modal contract', () => {
  afterEach(resetScrollLock);

  it('rejects the deliberate-red non-modal menu fixture', () => {
    const { container } = render(
      <div data-deliberate-red=''>
        <button type='button'>Background</button>
        <div data-testid='profile-menu-drawer'>
          <button type='button'>Share Profile</button>
        </div>
      </div>
    );
    expect(container.querySelector('[data-deliberate-red]')).toBeTruthy();
    const menu = screen.getByTestId('profile-menu-drawer');
    expect(menu.getAttribute('role')).not.toBe('dialog');
    expect(menu).not.toHaveAttribute('aria-modal', 'true');
  });

  it.each(
    VIEWPORTS
  )('$label ($width px, $presentation) exposes dialog semantics, contains Tab, and restores on Escape', async ({
    presentation,
  }) => {
    const user = userEvent.setup({ delay: null });
    const onOpenChange = vi.fn();
    render(
      <OpenShell presentation={presentation} onOpenChange={onOpenChange} />
    );
    const opener = screen.getByRole('button', { name: 'Open menu' });
    opener.focus();
    await user.click(opener);

    const dialog = screen.getByTestId('profile-menu-drawer');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('dialog')).toBe(dialog);

    const first = screen.getByRole('button', { name: 'Share Profile' });
    const last = screen.getByRole('button', { name: 'Pay' });
    expect(first).toHaveFocus();
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    opener.focus();
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(opener).toHaveFocus();
  });

  it('locks document scroll for modal and embedded presentations and cleans up', () => {
    const { unmount, rerender } = renderOpenShell('modal');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    rerender(<MenuShell presentation='embedded' />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('keeps Escape dismissal across a breakpoint presentation change while open', () => {
    const onOpenChange = vi.fn();
    const { rerender } = renderOpenShell('standalone', onOpenChange);
    for (const presentation of ['embedded', 'modal'] as const) {
      rerender(
        <MenuShell presentation={presentation} onOpenChange={onOpenChange} />
      );
    }
    expect(screen.getByTestId('profile-menu-drawer')).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Share Profile' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes a deep-link modal with no opener without throwing', () => {
    const onOpenChange = vi.fn();
    renderOpenShell('modal', onOpenChange);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('dismisses only the nested topmost dialog on Escape', () => {
    const onOpenChange = vi.fn();
    render(
      <MenuShell presentation='modal' onOpenChange={onOpenChange}>
        <button type='button'>Share Profile</button>
        <div
          role='dialog'
          aria-modal='true'
          aria-label='Confirm share'
          tabIndex={-1}
        >
          <button type='button'>Confirm</button>
        </div>
      </MenuShell>
    );
    screen.getByRole('button', { name: 'Confirm' }).focus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Confirm' }), {
      key: 'Escape',
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('profile-menu-drawer')).toBeInTheDocument();
  });

  it('closes from the supported backdrop control', () => {
    const onOpenChange = vi.fn();
    renderOpenShell('modal', onOpenChange);
    fireEvent.click(
      screen.getByRole('button', { name: 'Close Modal Overlay' })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not yank opener focus after a navigation unmount', () => {
    function LeavingShell() {
      const [left, setLeft] = useState(false);
      if (left) {
        return (
          <button type='button' data-testid='destination'>
            Destination
          </button>
        );
      }
      return (
        <div>
          <button type='button'>Open menu</button>
          <MenuShell presentation='modal' onOpenChange={() => undefined}>
            <button type='button' onClick={() => setLeft(true)}>
              Leave
            </button>
          </MenuShell>
        </div>
      );
    }
    render(<LeavingShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByTestId('destination')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-menu-drawer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
  });
});

describe('ProfileUnifiedDrawer public menu interactions', () => {
  afterEach(resetScrollLock);

  it.each([
    'standalone',
    'embedded',
    'modal',
  ] as const)('keeps Share → Pay → Contact order and gating in %s mode', presentation => {
    render(
      <ProfileUnifiedDrawer
        {...drawerProps}
        open
        presentation={presentation}
        hasTip
        hasContacts
      />
    );
    expect(
      within(screen.getByRole('menu'))
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Share Profile', 'Pay', 'Contact']);
  });

  it.each(CAPABILITY_FIXTURES)('capability fixture: $name', ({
    hasTip,
    hasContacts,
    visible,
    hidden,
  }) => {
    render(
      <MenuView
        onNavigate={vi.fn()}
        hasReleases={false}
        hasTourDates={false}
        hasTip={hasTip}
        hasContacts={hasContacts}
      />
    );
    const menu = screen.getByRole('menu');
    for (const label of visible) {
      expect(
        within(menu).getByRole('menuitem', { name: label })
      ).toBeInTheDocument();
    }
    for (const label of hidden) {
      expect(
        within(menu).queryByRole('menuitem', { name: label })
      ).not.toBeInTheDocument();
    }
  });

  it('activates a menu entry with Enter and keeps the shell open for in-drawer navigation', async () => {
    const user = userEvent.setup({ delay: null });
    const onViewChange = vi.fn();
    function Harness() {
      const [view, setView] = useState<'menu' | 'share'>('menu');
      return (
        <ProfileUnifiedDrawer
          {...drawerProps}
          open
          presentation='modal'
          view={view}
          onViewChange={next => {
            onViewChange(next);
            if (next === 'share' || next === 'menu') setView(next);
          }}
        />
      );
    }
    render(<Harness />);
    screen.getByRole('menuitem', { name: 'Share Profile' }).focus();
    await user.keyboard('{Enter}');
    expect(onViewChange).toHaveBeenCalledWith('share');
    expect(screen.getByTestId('profile-menu-drawer')).toBeInTheDocument();
  });
});
