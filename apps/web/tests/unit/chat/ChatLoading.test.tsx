import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/jovie/ChatWorkspaceSurface', () => ({
  ChatWorkspaceSurface: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='chat-workspace-surface'>{children}</div>
  ),
}));

vi.mock('@/components/jovie/components/ChatMessageSkeleton', () => ({
  ChatMessageSkeleton: () => <div data-testid='chat-message-skeleton' />,
  ChatConversationComposerSkeleton: () => (
    <div data-testid='chat-conversation-composer-skeleton' />
  ),
}));

vi.mock('@/components/molecules/LoadingSkeleton', () => ({
  LoadingSkeleton: (props: { height?: string; width?: string }) => (
    <div data-testid='loading-skeleton' data-height={props.height} />
  ),
}));

describe('ChatLoading (chat home)', () => {
  it('renders without errors', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/ChatLoadingState'
    );
    const { container } = render(<ChatLoading />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the workspace surface wrapper', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/ChatLoadingState'
    );
    render(<ChatLoading />);
    expect(screen.getByTestId('chat-workspace-surface')).toBeTruthy();
  });

  it('renders centered layout matching empty state', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/ChatLoadingState'
    );
    const { container } = render(<ChatLoading />);
    const centeredContainer = container.querySelector(
      '.items-center.justify-center'
    );
    expect(centeredContainer).toBeTruthy();
  });

  it('does not render ChatMessageSkeleton', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/ChatLoadingState'
    );
    render(<ChatLoading />);
    expect(screen.queryByTestId('chat-message-skeleton')).toBeNull();
  });

  it('sets aria-busy for accessibility', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/ChatLoadingState'
    );
    render(<ChatLoading />);
    expect(screen.getByTestId('chat-loading').getAttribute('aria-busy')).toBe(
      'true'
    );
  });

  it('does not expose disabled controls as the loading composer', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/ChatLoadingState'
    );
    render(<ChatLoading />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    // Product-voice placeholder is decorative under the busy shell.
    const placeholder = screen.getByText(
      'Ask Jovie to plan your next release...'
    );
    expect(placeholder.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
