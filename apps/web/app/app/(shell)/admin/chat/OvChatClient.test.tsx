import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: {
      id: 'profile_admin',
      displayName: 'Admin Artist',
      avatarUrl: null,
      username: 'admin-artist',
    },
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
    readonly profileId: string;
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
});
