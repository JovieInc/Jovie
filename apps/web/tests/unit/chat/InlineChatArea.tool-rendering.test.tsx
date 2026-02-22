import { screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fastRender } from '@/tests/utils/fast-render';

// --- Mocks ---

/** Captured messages from the useJovieChat mock. */
let mockMessages: Array<{
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
}> = [];

vi.mock('@/components/jovie/hooks', () => ({
  useJovieChat: () => ({
    messages: mockMessages,
    chatError: null,
    isLoading: false,
    isSubmitting: false,
    hasMessages: mockMessages.length > 0,
    submitMessage: vi.fn(),
    handleRetry: vi.fn(),
  }),
}));

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: () => React.createElement('span', { 'data-testid': 'brand-logo' }),
}));

vi.mock('@/components/dashboard/organisms/ProfileEditPreviewCard', () => ({
  ProfileEditPreviewCard: (props: { preview: { field: string } }) =>
    React.createElement('div', {
      'data-testid': 'profile-edit-preview-card',
      'data-field': props.preview.field,
    }),
}));

vi.mock('@/components/jovie/components/ChatAvatarUploadCard', () => ({
  ChatAvatarUploadCard: () =>
    React.createElement('div', { 'data-testid': 'avatar-upload-card' }),
}));

vi.mock('@/components/jovie/components/ChatLinkConfirmationCard', () => ({
  ChatLinkConfirmationCard: (props: { normalizedUrl: string }) =>
    React.createElement('div', {
      'data-testid': 'link-confirmation-card',
      'data-url': props.normalizedUrl,
    }),
}));

// Lazy import after mocks are set up
const { InlineChatArea } = await import(
  '@/components/dashboard/organisms/InlineChatArea'
);

function renderInlineChat(expanded = true) {
  return fastRender(
    <InlineChatArea profileId='profile-123' expanded={expanded} />
  );
}

describe('InlineChatArea tool invocation rendering', () => {
  beforeEach(() => {
    mockMessages = [];
    // jsdom does not implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders ProfileEditPreviewCard for proposeProfileEdit result', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Update my display name' }],
      },
      {
        id: 'msg-2',
        role: 'assistant',
        parts: [
          { type: 'text', text: "Here's a preview of the change:" },
          {
            type: 'tool-invocation',
            toolInvocationId: 'tool-1',
            toolName: 'proposeProfileEdit',
            state: 'result',
            result: {
              success: true,
              preview: {
                field: 'displayName',
                fieldLabel: 'Display name shown on your profile',
                currentValue: 'Old Name',
                newValue: 'New Name',
              },
            },
          },
        ],
      },
    ];

    renderInlineChat();

    expect(screen.getByTestId('profile-edit-preview-card')).toBeDefined();
    expect(
      screen.getByTestId('profile-edit-preview-card').getAttribute('data-field')
    ).toBe('displayName');
  });

  it('does NOT render ProfileEditPreviewCard when tool state is call', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocationId: 'tool-1',
            toolName: 'proposeProfileEdit',
            state: 'call',
            args: {
              field: 'displayName',
              newValue: 'New Name',
            },
          },
        ],
      },
    ];

    renderInlineChat();

    expect(screen.queryByTestId('profile-edit-preview-card')).toBeNull();
  });

  it('does NOT render ProfileEditPreviewCard when result has success: false', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocationId: 'tool-1',
            toolName: 'proposeProfileEdit',
            state: 'result',
            result: {
              success: false,
              error: 'Something went wrong',
            },
          },
        ],
      },
    ];

    renderInlineChat();

    expect(screen.queryByTestId('profile-edit-preview-card')).toBeNull();
  });

  it('renders ChatAvatarUploadCard for proposeAvatarUpload result', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocationId: 'tool-2',
            toolName: 'proposeAvatarUpload',
            state: 'result',
            result: { success: true, action: 'avatar_upload' },
          },
        ],
      },
    ];

    renderInlineChat();

    expect(screen.getByTestId('avatar-upload-card')).toBeDefined();
  });

  it('renders ChatLinkConfirmationCard for proposeSocialLink result', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocationId: 'tool-3',
            toolName: 'proposeSocialLink',
            state: 'result',
            result: {
              success: true,
              platform: {
                id: 'instagram',
                name: 'Instagram',
                icon: 'instagram',
                color: '#E4405F',
              },
              normalizedUrl: 'https://instagram.com/testartist',
              originalUrl: 'https://instagram.com/testartist',
            },
          },
        ],
      },
    ];

    renderInlineChat();

    const card = screen.getByTestId('link-confirmation-card');
    expect(card).toBeDefined();
    expect(card.getAttribute('data-url')).toBe(
      'https://instagram.com/testartist'
    );
  });

  it('does not render any cards when there are no tool invocations', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      },
      {
        id: 'msg-2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi there!' }],
      },
    ];

    renderInlineChat();

    expect(screen.queryByTestId('profile-edit-preview-card')).toBeNull();
    expect(screen.queryByTestId('avatar-upload-card')).toBeNull();
    expect(screen.queryByTestId('link-confirmation-card')).toBeNull();
  });
});
