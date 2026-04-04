import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/jovie/ChatWorkspaceSurface', () => ({
  ChatWorkspaceSurface: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='chat-workspace-surface'>{children}</div>
  ),
}));

vi.mock('@/components/jovie/components/ChatMessageSkeleton', () => ({
  ChatMessageSkeleton: () => <div data-testid='chat-message-skeleton' />,
}));

vi.mock('@/components/molecules/LoadingSkeleton', () => ({
  LoadingSkeleton: (props: { height?: string; width?: string }) => (
    <div data-testid='loading-skeleton' data-height={props.height} />
  ),
}));

describe('ChatLoading (chat home)', () => {
  it('renders without errors', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/loading'
    );
    const { container } = render(<ChatLoading />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the workspace surface wrapper', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/loading'
    );
    render(<ChatLoading />);
    expect(screen.getByTestId('chat-workspace-surface')).toBeTruthy();
  });

  it('renders centered layout matching empty state', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/loading'
    );
    const { container } = render(<ChatLoading />);
    const centeredContainer = container.querySelector(
      '.items-center.justify-center'
    );
    expect(centeredContainer).toBeTruthy();
  });

  it('does not render ChatMessageSkeleton', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/loading'
    );
    render(<ChatLoading />);
    expect(screen.queryByTestId('chat-message-skeleton')).toBeNull();
  });

  it('sets aria-busy for accessibility', async () => {
    const { default: ChatLoading } = await import(
      '@/app/app/(shell)/chat/loading'
    );
    render(<ChatLoading />);
    expect(screen.getByTestId('chat-loading').getAttribute('aria-busy')).toBe(
      'true'
    );
  });
});

describe('ChatConversationLoading (chat/[id])', () => {
  it('renders without errors', async () => {
    const { default: ChatConversationLoading } = await import(
      '@/app/app/(shell)/chat/[id]/loading'
    );
    const { container } = render(<ChatConversationLoading />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders ChatMessageSkeleton for conversation view', async () => {
    const { default: ChatConversationLoading } = await import(
      '@/app/app/(shell)/chat/[id]/loading'
    );
    render(<ChatConversationLoading />);
    expect(screen.getByTestId('chat-message-skeleton')).toBeTruthy();
  });

  it('renders a bottom input skeleton', async () => {
    const { default: ChatConversationLoading } = await import(
      '@/app/app/(shell)/chat/[id]/loading'
    );
    render(<ChatConversationLoading />);
    expect(screen.getByTestId('loading-skeleton')).toBeTruthy();
  });
});
