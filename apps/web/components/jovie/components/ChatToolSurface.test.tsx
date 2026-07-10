import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHAT_TOOL_CANCELLED_LABEL, ChatToolSurface } from './ChatToolSurface';

describe('ChatToolSurface', () => {
  it('exports a single cancelled label for all confirm cards', () => {
    expect(CHAT_TOOL_CANCELLED_LABEL).toBe('Cancelled');
  });

  it('renders default tone on System B surface classes', () => {
    render(
      <ChatToolSurface>
        <span>Pending action</span>
      </ChatToolSurface>
    );

    expect(screen.getByTestId('chat-tool-surface')).toHaveClass(
      'system-b-chat-tool-surface'
    );
    expect(screen.getByText('Pending action')).toBeInTheDocument();
  });

  it('renders success and cancelled tones', () => {
    const { rerender } = render(
      <ChatToolSurface tone='success'>
        <span>Done</span>
      </ChatToolSurface>
    );
    expect(screen.getByTestId('chat-tool-surface')).toHaveClass(
      'system-b-chat-tool-surface-success'
    );

    rerender(
      <ChatToolSurface tone='cancelled'>
        <span>{CHAT_TOOL_CANCELLED_LABEL}</span>
      </ChatToolSurface>
    );
    expect(screen.getByTestId('chat-tool-surface')).toHaveClass(
      'system-b-chat-tool-surface-cancelled'
    );
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('flat tone drops card chrome for nested use', () => {
    render(
      <ChatToolSurface tone='flat'>
        <span>Nested</span>
      </ChatToolSurface>
    );
    const surface = screen.getByTestId('chat-tool-surface');
    expect(surface).toHaveClass('system-b-chat-tool-surface-flat');
    expect(surface.tagName.toLowerCase()).toBe('div');
  });
});
