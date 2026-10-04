import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ReactNode, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardShellPrivacyBoundary } from '@/app/app/(shell)/DashboardShellPrivacyBoundary';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { useHeaderActions } from '@/contexts/HeaderActionsContext';
import { AuthShellWrapper } from './AuthShellWrapper';

const { route, lifecycle, routeEscape, privacyState, routeConfig, railScope } =
  vi.hoisted(() => ({
    route: { pathname: '/app/tasks' },
    lifecycle: vi.fn(),
    routeEscape: vi.fn(),
    privacyState: vi.fn(),
    routeConfig: { isChatRoute: false, isArtistProfileSettings: false },
    railScope: { current: undefined as string | undefined },
  }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/hooks/useAuthRouteConfig', () => ({
  useAuthRouteConfig: () => ({
    section: 'dashboard',
    breadcrumbs: [],
    showMobileTabs: false,
    isTableRoute: true,
    isChatRoute: routeConfig.isChatRoute,
    isArtistProfileSettings: routeConfig.isArtistProfileSettings,
  }),
}));
vi.mock('@/hooks/useDashboardShortcuts', () => ({
  useDashboardShortcuts: vi.fn(),
}));
vi.mock('@/hooks/useGlobalShortcutActions', () => ({
  useGlobalShortcutActions: vi.fn(),
}));
vi.mock('@/hooks/RightRailKeyboardHandler', () => ({
  RightRailKeyboardHandler: () => null,
}));
vi.mock('@/components/organisms/keyboard-shortcuts-sheet', () => ({
  KeyboardShortcutsSheet: () => null,
}));
vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  PreviewPanelProvider: ({
    children,
    scope,
  }: {
    children: ReactNode;
    scope?: string;
  }) => {
    railScope.current = scope;
    return children;
  },
}));
vi.mock('@/components/features/chat/Composer', () => ({
  ComposerFocusProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/contexts/RightPanelContext', () => ({
  RightPanelProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/providers/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/shell/ArtistProfileRailToggle', () => ({
  ArtistProfileRailToggle: () => null,
}));
vi.mock('@/components/organisms/AuthShell', () => ({ AuthShell: ShellFrame }));
vi.mock('@/lib/queries', () => ({
  useChatConversationsQuery: () => ({ data: [] }),
}));
vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('@/lib/queries/cache-isolation', () => ({ applyCacheScope: vi.fn() }));
vi.mock('@/features/workspace-lock/WorkspaceLockScreen', () => ({
  WorkspaceLockScreen: () => <div>Unlock Ovie</div>,
}));
vi.mock('@/lib/workspace-lock/workspace-lock', () => ({
  getWorkspacePrivacyLockState: privacyState,
  WORKSPACE_PRIVACY_LOCK_CONFIRMED_EVENT: 'ovie:privacy-lock-confirmed',
}));

function ShellFrame({
  children,
  commandPaletteHeader,
}: {
  children: ReactNode;
  commandPaletteHeader: ReactNode;
}) {
  const { openCommandPalette } = useHeaderActions();
  return (
    <>
      <header>
        <button type='button' onClick={openCommandPalette}>
          Search Jovie
        </button>
        {commandPaletteHeader}
      </header>
      <main>{children}</main>
    </>
  );
}
function RouteDocument({ id = 'tasks' }: { id?: string }) {
  const [selected, setSelected] = useState(false);
  const [draft, setDraft] = useState('Saved synthetic content');
  useEffect(() => {
    lifecycle('setup', id);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        routeEscape();
        setSelected(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      lifecycle('cleanup', id);
      window.removeEventListener('keydown', onKey);
    };
  }, [id]);
  return (
    <section aria-label={`Route ${id}`}>
      <button type='button' onClick={() => setSelected(true)}>
        Select synthetic task
      </button>
      {selected ? (
        <textarea
          aria-label='Synthetic draft'
          value={draft}
          onChange={event => setDraft(event.target.value)}
        />
      ) : (
        <p>No selection</p>
      )}
    </section>
  );
}
const dashboard: DashboardData = {
  user: { id: 'user-1' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  isAdmin: true,
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
function Boundary({
  children,
  initiallyLocked = false,
}: {
  children: ReactNode;
  initiallyLocked?: boolean;
}) {
  return (
    <DashboardShellPrivacyBoundary
      mode='ov'
      userId='user-1'
      dashboardData={dashboard}
      initiallyLocked={initiallyLocked}
      sidebarDefaultOpen
      previewPanelDefaultOpen
      persistSidebarCollapsed={async () => {}}
      privacyEnabled
      lockedUntil={
        initiallyLocked ? null : new Date(Date.now() + 86400000).toISOString()
      }
      unlockedShellChrome={<div>Private chrome</div>}
    >
      {children}
    </DashboardShellPrivacyBoundary>
  );
}
async function openSearch() {
  fireEvent.click(screen.getByRole('button', { name: 'Search Jovie' }));
  await screen.findByRole('combobox', { name: 'Command Palette Search' });
}
function closeSearch() {
  fireEvent.keyDown(
    screen.getByRole('combobox', { name: 'Command Palette Search' }),
    { key: 'Escape' }
  );
}

beforeEach(() => {
  route.pathname = '/app/tasks';
  routeConfig.isChatRoute = false;
  routeConfig.isArtistProfileSettings = false;
  railScope.current = undefined;
  lifecycle.mockClear();
  routeEscape.mockClear();
  privacyState.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('main-plane Search route recovery', () => {
  it('preserves the ordinary Jovie route independently of the optional Ovie boundary', async () => {
    render(
      <DashboardDataProvider value={dashboard}>
        <AuthShellWrapper mode='customer'>
          <RouteDocument />
        </AuthShellWrapper>
      </DashboardDataProvider>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select synthetic task' })
    );
    const selectedDocument = screen.getByLabelText('Synthetic draft');
    await openSearch();
    expect(selectedDocument).not.toBeVisible();
    closeSearch();
    expect(screen.getByLabelText('Synthetic draft')).toBe(selectedDocument);
    expect(selectedDocument).toBeVisible();
    expect(routeEscape).not.toHaveBeenCalled();
    expect(screen.queryByText('Unlock Ovie')).not.toBeInTheDocument();
  });

  it('restores the selected document, draft, DOM and focus after Search Escape', async () => {
    render(
      <Boundary>
        <RouteDocument />
      </Boundary>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select synthetic task' })
    );
    const draft = screen.getByLabelText('Synthetic draft');
    fireEvent.change(draft, { target: { value: 'Unsaved synthetic draft' } });
    draft.focus();
    await openSearch();
    expect(draft).not.toBeVisible();
    expect(screen.getByTestId('cmdk-main-plane')).toBeVisible();
    expect(lifecycle).toHaveBeenLastCalledWith('cleanup', 'tasks');
    closeSearch();
    await waitFor(() =>
      expect(screen.getByLabelText('Synthetic draft')).toHaveFocus()
    );
    expect(screen.getByLabelText('Synthetic draft')).toBe(draft);
    expect(draft).toHaveValue('Unsaved synthetic draft');
    expect(lifecycle).toHaveBeenLastCalledWith('setup', 'tasks');
    expect(routeEscape).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cmdk-main-plane')).not.toBeInTheDocument();
  });

  it('suspends ambient route Escape while Search is visible and resumes it afterwards', async () => {
    render(
      <Boundary>
        <RouteDocument />
      </Boundary>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select synthetic task' })
    );
    await openSearch();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('Synthetic draft')).toBeVisible();
    expect(routeEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(routeEscape).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Synthetic draft')).not.toBeInTheDocument();
  });

  it('does not resurrect the old route when navigation occurs during Search', async () => {
    const view = render(
      <Boundary>
        <RouteDocument key='tasks' />
      </Boundary>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select synthetic task' })
    );
    await openSearch();
    route.pathname = '/app/calendar';
    view.rerender(
      <Boundary>
        <RouteDocument key='calendar' id='calendar' />
      </Boundary>
    );
    closeSearch();
    expect(
      screen.getByRole('region', { name: 'Route calendar' })
    ).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Route tasks', hidden: true })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Synthetic draft')).not.toBeInTheDocument();
  });

  it('removes retained private DOM on an actual C lock event while Search is open', async () => {
    render(
      <Boundary>
        <RouteDocument />
      </Boundary>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Select synthetic task' })
    );
    const privateInput = screen.getByLabelText('Synthetic draft');
    await openSearch();
    act(() => {
      window.dispatchEvent(
        new CustomEvent('ovie:privacy-lock-confirmed', {
          detail: { enabled: true, locked: true, unlockedUntil: null },
        })
      );
    });
    expect(screen.getByText('Unlock Ovie')).toBeVisible();
    expect(privateInput).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Synthetic draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Private chrome')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cmdk-main-plane')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(routeEscape).not.toHaveBeenCalled();
  });

  it('scopes the profile rail to chat so it never opens unsolicited (JOV-7150)', () => {
    routeConfig.isChatRoute = true;
    render(
      <DashboardDataProvider value={dashboard}>
        <AuthShellWrapper mode='customer'>
          <RouteDocument />
        </AuthShellWrapper>
      </DashboardDataProvider>
    );
    expect(railScope.current).toBe('chat');
  });

  it('keeps the app-shell rail scope on ordinary routes', () => {
    render(
      <DashboardDataProvider value={dashboard}>
        <AuthShellWrapper mode='customer'>
          <RouteDocument />
        </AuthShellWrapper>
      </DashboardDataProvider>
    );
    expect(railScope.current).toBe('app-shell');
  });

  it('keeps the artist-profile-settings rail scope on profile settings', () => {
    routeConfig.isArtistProfileSettings = true;
    render(
      <DashboardDataProvider value={dashboard}>
        <AuthShellWrapper mode='customer'>
          <RouteDocument />
        </AuthShellWrapper>
      </DashboardDataProvider>
    );
    expect(railScope.current).toBe('artist-profile-settings');
  });

  it('never mounts private content or Search when the actual C boundary starts locked', () => {
    render(
      <Boundary initiallyLocked>
        <RouteDocument />
      </Boundary>
    );
    expect(screen.getByText('Unlock Ovie')).toBeVisible();
    expect(lifecycle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Search Jovie' }));
    expect(screen.queryByTestId('cmdk-main-plane')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Route tasks', hidden: true })
    ).not.toBeInTheDocument();
  });
});
