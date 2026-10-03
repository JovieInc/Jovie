import { render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OvieHomeBriefing } from '@/lib/ovie/home-briefing';

const homeBriefing: OvieHomeBriefing = {
  greeting: 'Good morning, Tim.',
  updatedLabel: 'Updated Sep 28, 8:00 AM PDT',
  signal: {
    id: 'shipping.milestone',
    title: 'The release milestone landed',
    summary: 'The highest-value shipping milestone is complete.',
    currentValue: '1 milestone',
    delta: null,
    target: null,
    sourceLabel: 'Shipping',
    nextAction: 'Review the customer impact.',
    removalEvent: 'The impact review is complete.',
    summerCanAct: true,
  },
  actions: [
    {
      id: 'shipping.milestone:evidence',
      label: 'Show The Evidence',
      prompt: 'Show the release evidence.',
    },
  ],
};

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

const jovieChatMounts = vi.hoisted(() => vi.fn());

vi.mock('@/components/jovie/JovieChat', () => ({
  JovieChat: ({
    profileId,
    chatMode,
    ovieHomeBriefing,
  }: {
    readonly profileId?: string;
    readonly chatMode?: 'ov' | null;
    readonly ovieHomeBriefing?: OvieHomeBriefing;
  }) => {
    useEffect(() => {
      jovieChatMounts();
    }, []);
    return (
      <div
        data-testid='shared-jovie-chat'
        data-profile-id={profileId}
        data-chat-mode={chatMode ?? undefined}
        data-signal-id={ovieHomeBriefing?.signal.id}
      />
    );
  },
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

  it('passes the OV mode and briefing through the canonical Jovie workspace', () => {
    render(<OvChatClient homeBriefing={homeBriefing} />);

    expect(screen.getByTestId('shared-chat-workspace')).toContainElement(
      screen.getByTestId('shared-jovie-chat')
    );
    expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
      'data-chat-mode',
      'ov'
    );
    expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
      'data-signal-id',
      'shipping.milestone'
    );
  });

  it('remounts the chat thread when the New Chat reset key changes (JOV-7358)', () => {
    jovieChatMounts.mockClear();
    const { rerender } = render(
      <OvChatClient homeBriefing={homeBriefing} resetKey='a' />
    );
    expect(jovieChatMounts).toHaveBeenCalledTimes(1);

    rerender(<OvChatClient homeBriefing={homeBriefing} resetKey='a' />);
    expect(jovieChatMounts).toHaveBeenCalledTimes(1);

    rerender(<OvChatClient homeBriefing={homeBriefing} resetKey='b' />);
    expect(jovieChatMounts).toHaveBeenCalledTimes(2);
  });

  it('renders founder OV chat without an artist profile', () => {
    dashboard.selectedProfile = null;
    render(<OvChatClient homeBriefing={homeBriefing} />);

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
