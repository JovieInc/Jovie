import { render, screen } from '@testing-library/react';
import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ChatEntityPanelProvider,
  useChatEntityPanel,
} from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { ChatEntityRightPanelHost } from '@/app/app/(shell)/chat/ChatEntityRightPanelHost';

const { mockUseRegisterRightPanel } = vi.hoisted(() => ({
  mockUseRegisterRightPanel: vi.fn(),
}));
let mockPreviewPanelOpen = false;

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicWrapper(props: Record<string, unknown>) {
      return React.createElement('div', {
        'data-testid': 'dynamic-import-stub',
        ...props,
      });
    },
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    isOpen: mockPreviewPanelOpen,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: mockUseRegisterRightPanel,
}));

vi.mock('@/components/providers/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

vi.mock('@/features/dashboard/organisms/profile-contact-sidebar', () => ({
  ProfileContactSidebar: () => <div data-testid='profile-contact-sidebar' />,
}));

function OpenReleaseTarget() {
  const { open } = useChatEntityPanel();

  useEffect(() => {
    open({
      kind: 'release',
      id: 'release-1',
      source: 'tool',
      focusKey: 'release-1',
    });
  }, [open]);

  return null;
}

function TargetLabel() {
  const { target } = useChatEntityPanel();
  return <div>{target?.kind ?? 'none'}</div>;
}

describe('ChatEntityRightPanelHost', () => {
  it('registers no right panel when preview is closed', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();

    render(
      <ChatEntityPanelProvider>
        <ChatEntityRightPanelHost enablePreviewPanel />
      </ChatEntityPanelProvider>
    );

    expect(mockUseRegisterRightPanel).toHaveBeenLastCalledWith(null);
  });

  it('registers the profile sidebar when preview is open', () => {
    mockPreviewPanelOpen = true;
    mockUseRegisterRightPanel.mockClear();

    render(
      <ChatEntityPanelProvider>
        <ChatEntityRightPanelHost enablePreviewPanel />
      </ChatEntityPanelProvider>
    );

    expect(mockUseRegisterRightPanel).toHaveBeenCalled();
    expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();
  });

  it('tracks chat-owned entity targets through the provider', () => {
    render(
      <ChatEntityPanelProvider>
        <OpenReleaseTarget />
        <TargetLabel />
      </ChatEntityPanelProvider>
    );

    expect(screen.getByText('release')).toBeInTheDocument();
  });
});
