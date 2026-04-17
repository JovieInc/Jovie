import { screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fastRender } from '@/tests/utils/fast-render';

// --- Mocks ---

// Mock @tanstack/react-virtual so the virtualizer renders all items in JSDOM
// (JSDOM elements have zero dimensions, so the real virtualizer renders nothing)
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 60,
        size: 60,
        key: i,
        measureElement: () => {},
      })),
    getTotalSize: () => count * 60,
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

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

vi.mock('@/features/dashboard/organisms/ProfileEditPreviewCard', () => ({
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

vi.mock('@/components/jovie/components/ChatAnalyticsCard', () => ({
  ChatAnalyticsCard: (props: { result: { title: string } }) =>
    React.createElement('div', {
      'data-testid': 'chat-analytics-card',
      'data-title': props.result.title,
    }),
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
  '@/features/dashboard/organisms/InlineChatArea'
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
            type: 'dynamic-tool',
            toolName: 'proposeProfileEdit',
            toolCallId: 'tool-1',
            state: 'output-available',
            input: { field: 'displayName' },
            output: {
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
            type: 'dynamic-tool',
            toolName: 'proposeProfileEdit',
            toolCallId: 'tool-1',
            state: 'input-available',
            input: {
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
            type: 'dynamic-tool',
            toolName: 'proposeProfileEdit',
            toolCallId: 'tool-1',
            state: 'output-available',
            output: {
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
            type: 'dynamic-tool',
            toolName: 'proposeAvatarUpload',
            toolCallId: 'tool-2',
            state: 'output-available',
            output: { success: true, action: 'avatar_upload' },
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
            type: 'dynamic-tool',
            toolName: 'proposeSocialLink',
            toolCallId: 'tool-3',
            state: 'output-available',
            output: {
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

  it('renders ChatAnalyticsCard for showTopInsights result', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'showTopInsights',
            toolCallId: 'tool-4',
            state: 'output-available',
            output: {
              success: true,
              title: 'Top signals',
              totalActive: 2,
              insights: [],
            },
          },
        ],
      },
    ];

    renderInlineChat();

    const card = screen.getByTestId('chat-analytics-card');
    expect(card).toBeDefined();
    expect(card.getAttribute('data-title')).toBe('Top signals');
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
    expect(screen.queryByTestId('chat-analytics-card')).toBeNull();
    expect(screen.queryByTestId('link-confirmation-card')).toBeNull();
  });

  it('renders a compact status row for unknown tools', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'summarizeAudience',
            toolCallId: 'tool-5',
            state: 'output-available',
            output: {
              summary: 'Audience summary complete.',
            },
          },
        ],
      },
    ];

    renderInlineChat();

    const statusRow = screen.getByTestId('tool-status-row');
    expect(statusRow.getAttribute('data-tool-name')).toBe('summarizeAudience');
    expect(screen.getByText('Summarize Audience')).toBeDefined();
    expect(screen.getByText('Audience summary complete.')).toBeDefined();
  });
});
