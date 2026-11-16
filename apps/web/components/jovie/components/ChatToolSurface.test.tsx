import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CHAT_TOOL_CANCELLED_LABEL,
  ChatToolSurface,
  type ChatToolSurfaceTone,
} from './ChatToolSurface';

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

describe('ChatToolSurface certificate states', () => {
  const longCopy =
    'Add https://open.spotify.com/artist/0abcdefghijklmnopqrstuvwxyz1234567890 to your profile and replace the existing Spotify link from the 2019 project?';

  it.each([
    'default',
    'success',
    'cancelled',
    'flat',
  ] as const satisfies readonly ChatToolSurfaceTone[])(
    'has no axe violations in the %s tone',
    async tone => {
      const { container } = render(
        <ChatToolSurface tone={tone}>
          <p>Confirm this action?</p>
        </ChatToolSurface>
      );
      await expectNoA11yViolations(container);
    }
  );

  it('keeps long copy inside the surface and stays axe-clean', async () => {
    const { container } = render(
      <ChatToolSurface>
        <p>{longCopy}</p>
      </ChatToolSurface>
    );
    expect(screen.getByTestId('chat-tool-surface')).toHaveTextContent(longCopy);
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left children unchanged and stays axe-clean', async () => {
    const { container } = render(
      <ChatToolSurface tone='success'>
        <p dir='rtl' lang='ar'>
          تمت إضافة رابط سبوتيفاي إلى ملفك الشخصي.
        </p>
      </ChatToolSurface>
    );
    expect(
      screen.getByText('تمت إضافة رابط سبوتيفاي إلى ملفك الشخصي.')
    ).toHaveAttribute('dir', 'rtl');
    await expectNoA11yViolations(container);
  });
});
