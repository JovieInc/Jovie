import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dashboard = vi.hoisted(() => ({
  selectedProfile: {
    id: 'profile_admin',
    displayName: 'Admin Artist',
    avatarUrl: null,
    username: 'admin-artist',
  } as {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    username: string;
  } | null,
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: dashboard.selectedProfile,
    creatorProfiles: [],
  }),
}));

vi.mock('@/components/jovie/ChatWorkspaceSurface', () => ({
  ChatWorkspaceSurface: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='shared-chat-workspace'>{children}</div>
  ),
}));

vi.mock('@/components/jovie/JovieChat', () => ({
  JovieChat: ({
    profileId,
    chatMode,
  }: {
    readonly profileId?: string;
    readonly chatMode?: 'ov' | null;
  }) => (
    <div
      data-testid='shared-jovie-chat'
      data-profile-id={profileId}
      data-chat-mode={chatMode ?? undefined}
    />
  ),
}));

import { OvChatClient } from './OvChatClient';

describe('OvChatClient shared component ownership', () => {
  afterEach(() => {
    dashboard.selectedProfile = {
      id: 'profile_admin',
      displayName: 'Admin Artist',
      avatarUrl: null,
      username: 'admin-artist',
    };
  });

  it('uses the canonical Jovie workspace and chat with only the typed OV mode difference', () => {
    render(<OvChatClient />);

    expect(screen.getByTestId('shared-chat-workspace')).toContainElement(
      screen.getByTestId('shared-jovie-chat')
    );
    expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
      'data-chat-mode',
      'ov'
    );
  });

  it('renders founder OV chat without an artist profile', () => {
    dashboard.selectedProfile = null;
    render(<OvChatClient />);

    expect(screen.getByTestId('shared-chat-workspace')).toContainElement(
      screen.getByTestId('shared-jovie-chat')
    );
    expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
      'data-chat-mode',
      'ov'
    );
    expect(screen.getByTestId('shared-jovie-chat')).not.toHaveAttribute(
      'data-profile-id'
    );
  });
});
