import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatWorkspaceSurface } from './ChatWorkspaceSurface';

describe('ChatWorkspaceSurface', () => {
  it('anchors chat content in a full-height, panel-scrolled surface', async () => {
    const { container } = render(
      <div className='relative'>
        <ChatWorkspaceSurface className='chat-route'>
          <p>Chat transcript</p>
        </ChatWorkspaceSurface>
      </div>
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('chat-route', 'overflow-hidden');
    expect(section?.firstElementChild).toHaveClass(
      'max-w-(--app-shell-content-max-wide)'
    );
    expect(screen.getByText('Chat transcript').parentElement).toHaveClass(
      'absolute',
      'inset-0',
      'flex-col'
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations with a long transcript', async () => {
    const { container } = render(
      <ChatWorkspaceSurface>
        {Array.from({ length: 20 }, (_, index) => index + 1).map(turn => (
          <p key={`turn-${turn}`}>
            Turn {turn}: A long assistant reply about release planning that
            wraps across several lines.
          </p>
        ))}
      </ChatWorkspaceSurface>
    );
    expect(screen.getAllByText(/^Turn \d+:/)).toHaveLength(20);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatWorkspaceSurface>
          <p>سجل المحادثة</p>
        </ChatWorkspaceSurface>
      </div>
    );
    expect(screen.getByText('سجل المحادثة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
