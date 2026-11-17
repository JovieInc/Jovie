import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthShellWrapper, usePendingShell } from './AuthShellWrapper';

const { routeConfig, captureError } = vi.hoisted(() => ({
  routeConfig: {
    section: 'dashboard',
    breadcrumbs: [] as { label: string }[],
  },
  captureError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/releases',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/hooks/useAuthRouteConfig', () => ({
  useAuthRouteConfig: () => ({
    section: routeConfig.section,
    breadcrumbs: routeConfig.breadcrumbs,
    showMobileTabs: false,
    isTableRoute: false,
    isChatRoute: false,
    isProfileSettings: false,
  }),
}));
vi.mock('@/hooks/useGlobalShortcutActions', () => ({
  useGlobalShortcutActions: vi.fn(),
}));
vi.mock('@/hooks/RightRailKeyboardHandler', () => ({
  RightRailKeyboardHandler: () => null,
}));
vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  PreviewPanelProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/features/chat/Composer', () => ({
  ComposerFocusProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/contexts/RightPanelContext', () => ({
  RightPanelProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/shell/ArtistProfileRailToggle', () => ({
  ArtistProfileRailToggle: () => null,
}));
vi.mock('@/lib/sentry/init', () => ({
  getSentryMode: () => 'disabled',
  isSentryInitialized: () => false,
}));
vi.mock('@/lib/errors/capture', async importOriginal => ({
  ...(await importOriginal<object>()),
  captureErrorInSentry: captureError,
}));
vi.mock('./AuthShell', () => ({
  AuthShell: ({
    breadcrumbs,
    headerAction,
    onSidebarOpenChange,
    children,
  }: {
    breadcrumbs: { label: string }[];
    headerAction?: ReactNode;
    onSidebarOpenChange?: (open: boolean) => void;
    children: ReactNode;
  }) => (
    <>
      <header>
        <nav aria-label='Breadcrumb'>
          {breadcrumbs.map(crumb => (
            <span key={crumb.label}>{crumb.label}</span>
          ))}
        </nav>
        <button type='button' onClick={() => onSidebarOpenChange?.(false)}>
          Collapse sidebar
        </button>
        {headerAction}
      </header>
      <main>{children}</main>
    </>
  ),
}));

function OpenReleasesShell() {
  const { showPendingShell } = usePendingShell();
  return (
    <button type='button' onClick={() => showPendingShell('releases')}>
      Open Releases
    </button>
  );
}

function ThrowingAction(): ReactNode {
  throw new Error('header action failed');
}

function RegisterThrowingAction() {
  const { setHeaderActions } = useSetHeaderActions();
  useEffect(() => {
    setHeaderActions(<ThrowingAction />);
  }, [setHeaderActions]);
  return <p>Route content</p>;
}

beforeEach(() => {
  routeConfig.section = 'dashboard';
  routeConfig.breadcrumbs = [];
  captureError.mockClear();
});

describe('AuthShellWrapper accessibility', () => {
  it('persists a collapsed sidebar and survives an offline save', async () => {
    const user = userEvent.setup();
    const persist = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { container } = render(
      <AuthShellWrapper persistSidebarCollapsed={persist}>
        <p>Route content</p>
      </AuthShellWrapper>
    );

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    await waitFor(() => expect(persist).toHaveBeenCalledWith(true));
    expect(screen.getByText('Route content')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('announces the pending Releases shell without axe violations', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AuthShellWrapper>
        <OpenReleasesShell />
      </AuthShellWrapper>
    );

    await user.click(screen.getByRole('button', { name: 'Open Releases' }));

    expect(screen.getByRole('status')).toHaveTextContent('Opening Releases');
    await expectNoA11yViolations(container);
  });

  it('drops a throwing header action and keeps the route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <AuthShellWrapper>
        <RegisterThrowingAction />
      </AuthShellWrapper>
    );

    await waitFor(() => expect(captureError).toHaveBeenCalled());
    expect(screen.getByText('Route content')).toBeInTheDocument();
    expect(screen.getByRole('banner')).not.toHaveTextContent(
      'header action failed'
    );
    await expectNoA11yViolations(container);
  });

  it('renders a locked workspace without the command palette or retained route', async () => {
    const { container } = render(
      <AuthShellWrapper isWorkspaceLocked>
        <p>Unlock Ovie</p>
      </AuthShellWrapper>
    );
    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations with long breadcrumbs in a right-to-left document', async () => {
    routeConfig.breadcrumbs = [
      { label: 'الإصدارات' },
      {
        label:
          'عنوان ألبوم طويل جدا يستمر إلى ما بعد عرض الشريط (إصدار الذكرى الموسع)',
      },
    ];
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AuthShellWrapper>
          <p>محتوى الصفحة</p>
        </AuthShellWrapper>
      </div>
    );
    expect(screen.getByText('محتوى الصفحة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
