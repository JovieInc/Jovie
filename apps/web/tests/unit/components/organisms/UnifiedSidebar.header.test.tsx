import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  electronRuntimeMock,
  renderUnifiedSidebar,
  resetUnifiedSidebarTestState,
} from './UnifiedSidebar.test-harness';

vi.mock('next/link', async () =>
  (await import('./UnifiedSidebar.mock-factories')).nextLinkMock()
);

vi.mock('next/navigation', async () =>
  (await import('./UnifiedSidebar.mock-factories')).nextNavigationMock()
);

vi.mock('@/lib/desktop/electron-bridge', async importOriginal =>
  (await import('./UnifiedSidebar.mock-factories')).electronBridgeMock(
    await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()
  )
);

vi.mock('@/hooks/useClerkSafe', async () =>
  (await import('./UnifiedSidebar.mock-factories')).clerkSafeMock()
);

vi.mock('@/features/dashboard/dashboard-nav', async () =>
  (await import('./UnifiedSidebar.mock-factories')).dashboardNavMock()
);

vi.mock('@/components/shell/HeaderSearchSurfaceFromContext', async () =>
  (await import('./UnifiedSidebar.mock-factories')).headerSearchSurfaceMock()
);

vi.mock('@/components/organisms/user-button', async () =>
  (await import('./UnifiedSidebar.mock-factories')).userButtonMock()
);

vi.mock('@/components/organisms/SidebarDockBridge', async () =>
  (await import('./UnifiedSidebar.mock-factories')).sidebarDockBridgeMock()
);

describe('UnifiedSidebar header', () => {
  afterEach(() => {
    resetUnifiedSidebarTestState();
  });

  it('uses existing subtle border token without growing --linear-* namespace', () => {
    const linearTokens = readFileSync(
      join(__dirname, '../../../..', 'styles/linear-tokens.css'),
      'utf8'
    );
    const designSystem = readFileSync(
      join(__dirname, '../../../..', 'styles/design-system.css'),
      'utf8'
    );

    expect(linearTokens).toMatch(
      /--linear-border-subtle:\s*rgba\(0, 0, 0, 0\.06\);/
    );
    // --app-shell-frame-seam was retired from linear-tokens.css to
    // design-system.css (JOV-5466); assert canonical location.
    expect(designSystem).toMatch(
      /--app-shell-frame-seam:\s*rgba\(0, 0, 0, 0\.045\);/
    );
    expect(linearTokens).toMatch(
      /:root\.dark[\s\S]*--linear-border-subtle:\s*rgba\(168, 176, 195, 0\.1\);/
    );
    expect(designSystem).toMatch(
      /:root\.dark[\s\S]*--app-shell-frame-seam:\s*rgba\(168, 176, 195, 0\.1\);/
    );
    expect(linearTokens).not.toMatch(/--linear-border-divider-subtle/);
    // The retired token must not reappear in the linear namespace.
    expect(linearTokens).not.toMatch(/--linear-app-frame-seam/);
  });

  it('uses the single unified header-height token for route/operator sidebar headers (founder lock 2026-09-25)', () => {
    const source = readFileSync(
      join(__dirname, '../../../..', 'components/organisms/UnifiedSidebar.tsx'),
      'utf8'
    );

    expect(source).toContain("'h-(--app-shell-header-height) py-0.5'");
    expect(source).not.toContain(
      "'h-(--app-shell-header-height-compact) py-0.5'"
    );
  });

  it('omits header New Conversation and the web collapse control in Electron dashboard mode', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    expect(
      screen.getByRole('button', { name: 'Ask Jovie' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New Chat' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' })
    ).not.toBeInTheDocument();
  });

  it('uses the in-sidebar collapse control as the web dashboard toggle', () => {
    electronRuntimeMock.isElectronRuntime = false;

    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New Chat' })
    ).not.toBeInTheDocument();
  });

  it('stages browser header chrome without dropping the expanded toggle (JOV-4522)', () => {
    electronRuntimeMock.isElectronRuntime = false;

    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    // The wrapper stages the in-sidebar control out when the main header
    // takes ownership in compact mode; the expanded control stays mounted.
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle.parentElement?.className).toContain(
      'group-data-[collapsible=icon]:order-first'
    );
    expect(toggle.parentElement?.className).toContain(
      'group-data-[collapsible=icon]:mx-auto'
    );

    const brandRow = toggle.closest('[data-sidebar-brand-row]');
    expect(brandRow).not.toBeNull();
    const stagedCluster = brandRow?.querySelector(
      '[data-sidebar-header-actions]'
    );
    expect(stagedCluster).not.toBeNull();
    expect(stagedCluster?.className).toContain(
      'group-data-[collapsible=icon]:max-w-0'
    );
    expect(stagedCluster?.className).not.toContain(
      'group-data-[collapsible=icon]:hidden'
    );
  });

  it('renders bell and rail toggle from one header actions contract in the brand row', () => {
    electronRuntimeMock.isElectronRuntime = false;

    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    const brandRow = toggle.closest('[data-sidebar-brand-row]');
    const toggleSlot = toggle.closest('[data-sidebar-header-toggle-slot]');
    expect(toggleSlot).not.toBeNull();
    expect(brandRow?.contains(toggleSlot ?? null)).toBe(true);

    const bell = screen.getByRole('link', { name: /^Inbox/ });
    expect(bell.closest('[data-sidebar-header-actions]')?.contains(bell)).toBe(
      true
    );
    // Bell and toggle share the same 28px box so the header reads as one row.
    for (const control of [bell, toggle]) {
      expect(control).toHaveClass('size-7', 'rounded-md', 'focus-ring-themed');
    }
  });

  it.each([
    {
      section: 'dashboard' as const,
      variant: 'jovie' as const,
      pathname: APP_ROUTES.DASHBOARD,
    },
    { section: 'ov' as const, variant: 'ov' as const, pathname: APP_ROUTES.OV },
  ])(
    'keeps the canonical $variant logo exposed when restored collapsed',
    ({ section, variant, pathname }) => {
      electronRuntimeMock.isElectronRuntime = false;
      const { container } = renderUnifiedSidebar({
        section,
        variant,
        pathname,
        isAdmin: true,
        sidebarDefaultOpen: false,
      });
      const logos = container.querySelectorAll(
        `[data-brand-variant="${variant}"]`
      );
      expect(logos).toHaveLength(1);
      expect(
        logos[0].parentElement?.closest('[inert], [aria-hidden="true"]')
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: /Switch Workspace:/ })
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'Expand sidebar' })
      ).toHaveLength(1);
    }
  );

  it('turns the logo into a workspace selector for admins', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
      isAdmin: true,
    });

    expect(
      screen.getByRole('button', { name: /Switch Workspace:/ })
    ).toHaveTextContent('Jovie');
  });

  it('does not expose the workspace selector to non-admins', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
      isAdmin: false,
    });

    expect(
      screen.queryByRole('button', { name: /Switch Workspace:/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ask Jovie' })
    ).toBeInTheDocument();
  });

  it('shows OV as the active admin workspace without changing header height', () => {
    const { container } = renderUnifiedSidebar({
      pathname: APP_ROUTES.OV,
      section: 'ov',
      isAdmin: true,
      variant: 'ov',
    });

    const trigger = screen.getByRole('button', { name: /Switch Workspace:/ });
    expect(trigger).toHaveTextContent('OV');
    expect(trigger).toHaveClass('h-7');
    expect(container.querySelector('[data-brand-variant="ov"]')).not.toBeNull();
  });

  it('keeps the static OV mark at nav-icon scale with no footer duplicate', () => {
    const { container } = renderUnifiedSidebar({
      pathname: APP_ROUTES.OV,
      section: 'ov',
      variant: 'ov',
    });

    const marks = container.querySelectorAll('[data-brand-variant="ov"]');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute('data-brand-mark-size', '16');
    expect(marks[0]?.closest('[data-sidebar="header"]')).not.toBeNull();
  });
});
