import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, screen } from '@testing-library/react';
import {
  type ComponentProps,
  cloneElement,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatError } from '@/components/jovie/types';
import { fastRender } from '@/tests/utils/fast-render';

const appRoot = resolve(__dirname, '../../..');

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

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      layoutId?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    size,
    variant,
    ...props
  }: ComponentProps<'button'> & { size?: string; variant?: string }) => (
    <button data-size={size} data-variant={variant} {...props}>
      {children}
    </button>
  ),
  Card: ({
    children,
    asChild,
    className,
    unstyled: _unstyled,
    ...props
  }: ComponentProps<'div'> & { asChild?: boolean; unstyled?: boolean }) => {
    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<{ className?: string }>;
      return cloneElement(child, {
        ...props,
        className: [className, child.props.className].filter(Boolean).join(' '),
      });
    }

    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  },
  SimpleTooltip: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
  Popover: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  PopoverContent: ({
    children,
    testId = 'popover-content',
  }: {
    readonly children: ReactNode;
    readonly testId?: string;
  }) => <div data-testid={testId}>{children}</div>,
  PopoverTrigger: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    unoptimized: _unoptimized,
    ...rest
  }: ComponentProps<'img'> & { fill?: boolean; unoptimized?: boolean }) => (
    <img src={src as string} alt={alt ?? ''} {...rest} />
  ),
}));

vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { readonly content: string }) => (
    <div>{content}</div>
  ),
}));

/** Captured messages from the useJovieChat mock. */
let mockMessages: Array<{
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
}> = [];
let mockChatError: ChatError | null = null;
let mockIsLoading = false;
let mockIsSubmitting = false;
const mockHandleRetry = vi.fn();

vi.mock('@/components/jovie/hooks', () => ({
  useJovieChat: () => ({
    messages: mockMessages,
    chatError: mockChatError,
    isLoading: mockIsLoading,
    isSubmitting: mockIsSubmitting,
    hasMessages: mockMessages.length > 0,
    submitMessage: vi.fn(),
    handleRetry: mockHandleRetry,
  }),
}));

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: () => createElement('span', { 'data-testid': 'brand-logo' }),
}));

vi.mock('@/features/dashboard/organisms/ProfileEditPreviewCard', () => ({
  ProfileEditPreviewCard: (props: { preview: { field: string } }) =>
    createElement('div', {
      'data-testid': 'profile-edit-preview-card',
      'data-field': props.preview.field,
    }),
}));

vi.mock('@/components/jovie/components/ChatAvatarUploadCard', () => ({
  ChatAvatarUploadCard: () =>
    createElement('div', { 'data-testid': 'avatar-upload-card' }),
}));

vi.mock('@/components/jovie/components/ChatAnalyticsCard', () => ({
  ChatAnalyticsCard: (props: { result: { title: string } }) =>
    createElement('div', {
      'data-testid': 'chat-analytics-card',
      'data-title': props.result.title,
    }),
}));

vi.mock('@/components/jovie/components/ChatLinkConfirmationCard', () => ({
  ChatLinkConfirmationCard: (props: { normalizedUrl: string }) =>
    createElement('div', {
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
    mockChatError = null;
    mockIsLoading = false;
    mockIsSubmitting = false;
    mockHandleRetry.mockClear();
    // jsdom does not implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('keeps inline transcript bubbles on the canonical ChatMessage owner', () => {
    const inlineChatAreaSource = readFileSync(
      resolve(
        appRoot,
        'components/features/dashboard/organisms/InlineChatArea.tsx'
      ),
      'utf8'
    );
    const chatMessageSource = readFileSync(
      resolve(appRoot, 'components/jovie/components/ChatMessage.tsx'),
      'utf8'
    );

    expect(inlineChatAreaSource).toContain('ChatMessage');
    expect(inlineChatAreaSource).not.toContain('const InlineChatMessage');
    expect(inlineChatAreaSource).not.toContain('max-w-[85%]');
    expect(inlineChatAreaSource).not.toContain('rounded-xl px-3 py-2');
    expect(chatMessageSource).toContain('toolVariant');
    expect(chatMessageSource).toContain('showAssistantActions');
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

  it('renders user transcript bubbles with neutral System B chrome', () => {
    mockMessages = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Keep this quiet and neutral' }],
      },
    ];

    renderInlineChat();

    const bubble = screen.getByTestId('chat-user-bubble');

    expect(bubble).toHaveClass('system-b-chat-user-bubble');
    expect(bubble).toHaveAttribute('data-bubble-shape', 'pill');
    expect(bubble).toHaveTextContent('Keep this quiet and neutral');
    expect(bubble.closest('[data-message-id="msg-1"]')).toHaveAttribute(
      'data-role',
      'user'
    );
  });

  it('renders assistant replies through ChatMessage without full-chat action metadata', () => {
    mockMessages = [
      {
        id: 'msg-assistant',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Inline answer' }],
      },
    ];

    renderInlineChat();

    expect(screen.getByTestId('chat-message-reply')).toHaveClass(
      'system-b-chat-message-reply'
    );
    expect(
      screen.getByTestId('chat-message-reply').closest('[data-message-id]')
    ).toHaveAttribute('data-message-id', 'msg-assistant');
    expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull();
  });

  it('renders inline loading as the canonical compact typing bubble', () => {
    mockMessages = [
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Generate an answer' }],
      },
    ];
    mockIsLoading = true;

    renderInlineChat();

    const loading = screen.getByTestId('chat-loading-indicator');
    expect(loading).toHaveClass('system-b-chat-loading-indicator');
    expect(screen.getByTestId('chat-typing-bubble')).toHaveClass(
      'system-b-chat-typing-bubble'
    );
    expect(loading.closest('[data-message-id]')).toHaveAttribute(
      'data-message-id',
      'inline-chat-loading'
    );
  });

  it('renders inline errors through the canonical chat retry display', () => {
    mockMessages = [
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Retry this' }],
      },
    ];
    mockChatError = {
      type: 'network',
      message: 'The request disconnected.',
      failedMessage: 'Retry this',
    };

    renderInlineChat();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Message paused');
    expect(alert).toHaveTextContent('The request disconnected.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry Message' }));
    expect(mockHandleRetry).toHaveBeenCalledTimes(1);
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
    expect(screen.getByText('Summarize audience done')).toBeDefined();
    expect(screen.getByText('Audience summary complete.')).toBeDefined();
  });
});
