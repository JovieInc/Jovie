import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthShell } from '@/components/organisms/AuthShell';

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ toggle: vi.fn() }),
}));

vi.mock('@/components/features/chat/Composer', () => ({
  useComposerFocus: () => ({ isComposerFocused: false }),
}));

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    sidebar,
    header,
    main,
  }: {
    sidebar: ReactNode;
    header?: ReactNode;
    main: ReactNode;
  }) => (
    <div data-testid='composed-chat-shell'>
      {sidebar}
      {header}
      {main}
    </div>
  ),
}));

vi.mock('@/components/organisms/PersistentAudioBar', () => ({
  PersistentAudioBar: () => null,
}));

vi.mock('@/components/organisms/Sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
  SidebarTrigger: () => null,
  useSidebar: () => ({ isMobile: false, state: 'open' }),
}));

vi.mock('@/components/organisms/UnifiedSidebar', () => ({
  UnifiedSidebar: () => (
    <nav aria-label='Primary navigation'>
      <Link href='/app/chat'>New Chat</Link>
    </nav>
  ),
}));

vi.mock('@/contexts/RightPanelContext', () => ({
  useRightPanel: () => null,
}));

vi.mock('@/features/dashboard/organisms/DashboardMobileTabs', () => ({
  DashboardMobileTabs: () => null,
}));

vi.mock('@/features/dashboard/organisms/MobileProfileDrawer', () => ({
  MobileProfileDrawer: () => null,
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => true,
}));

describe('/app/chat composed shell header (JOV-4347)', () => {
  it.each([
    { breakpoint: 'mobile', width: 375 },
    { breakpoint: 'desktop', width: 1280 },
  ])('exposes one heading and profile action at the $breakpoint contract', ({
    width,
  }) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    });

    render(
      <AuthShell
        section='dashboard'
        breadcrumbs={[{ label: 'New Chat', href: '/app/chat' }]}
        headerAction={
          <button type='button' aria-label='Show Tim White profile'>
            TW
          </button>
        }
        isChatRoute
      >
        <div>Chat workspace</div>
      </AuthShell>
    );

    expect(screen.getByTestId('composed-chat-shell')).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { name: 'New Chat', level: 1 })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Show Tim White profile' })
    ).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'New Chat' })).toHaveAttribute(
      'href',
      '/app/chat'
    );
  });
});
