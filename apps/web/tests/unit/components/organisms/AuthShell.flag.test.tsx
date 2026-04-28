import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthShell } from '@/components/organisms/AuthShell';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { FF_OVERRIDES_KEY } from '@/lib/flags/overrides';

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ toggle: vi.fn() }),
}));

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    main,
    variant,
  }: {
    main: ReactNode;
    variant: 'legacy' | 'shellChatV1';
  }) => (
    <div data-testid='app-shell-frame' data-shell-design={variant}>
      {main}
    </div>
  ),
}));

vi.mock('@/components/organisms/PersistentAudioBar', () => ({
  PersistentAudioBar: () => null,
}));

vi.mock('@/components/organisms/Sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarTrigger: () => <button type='button'>Toggle Sidebar</button>,
  useSidebar: () => ({ isMobile: false }),
}));

vi.mock('@/components/organisms/UnifiedSidebar', () => ({
  UnifiedSidebar: () => <aside>Sidebar</aside>,
}));

vi.mock('@/contexts/RightPanelContext', () => ({
  useRightPanel: () => null,
}));

vi.mock('@/features/dashboard/organisms/DashboardHeader', () => ({
  DashboardHeader: () => <header>Dashboard Header</header>,
}));

vi.mock('@/features/dashboard/organisms/DashboardMobileTabs', () => ({
  DashboardMobileTabs: () => <nav>Mobile Tabs</nav>,
}));

vi.mock('@/features/dashboard/organisms/MobileProfileDrawer', () => ({
  MobileProfileDrawer: () => null,
}));

function renderAuthShell(shellChatV1: boolean) {
  render(
    <AppFlagProvider
      initialFlags={{ ...APP_FLAG_DEFAULTS, SHELL_CHAT_V1: shellChatV1 }}
    >
      <AuthShell section='dashboard' breadcrumbs={[]}>
        <div>Shell Content</div>
      </AuthShell>
    </AppFlagProvider>
  );
}

describe('AuthShell SHELL_CHAT_V1 wiring', () => {
  beforeEach(() => {
    localStorage.removeItem(FF_OVERRIDES_KEY);
  });

  it('uses the legacy shell frame when SHELL_CHAT_V1 is disabled', () => {
    renderAuthShell(false);

    expect(screen.getByTestId('app-shell-frame')).toHaveAttribute(
      'data-shell-design',
      'legacy'
    );
  });

  it('uses the shell chat V1 frame when SHELL_CHAT_V1 is enabled', () => {
    renderAuthShell(true);

    expect(screen.getByTestId('app-shell-frame')).toHaveAttribute(
      'data-shell-design',
      'shellChatV1'
    );
  });
});
