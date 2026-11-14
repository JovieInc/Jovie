import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TOOL_STATE_PARTS } from './fixtures/tool-states';
import { ToolPartsRenderer } from './tool-ui';

const upgrade = vi.hoisted(() => vi.fn());

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children?: ReactNode }) => (
    <button type='button' onClick={upgrade}>
      {children}
    </button>
  ),
}));

describe('ToolPartsRenderer states', () => {
  it('shows a running status row while the stream is open', async () => {
    const { container } = render(
      <ToolPartsRenderer
        variant='chat'
        isStreaming
        parts={TOOL_STATE_PARTS.loading}
      />
    );

    expect(screen.getByRole('status')).toHaveAttribute(
      'data-operation-status',
      'working'
    );
    await expectNoA11yViolations(container);
  });

  it('renders nothing when the reply has no tool parts', () => {
    const { container } = render(
      <ToolPartsRenderer variant='chat' parts={TOOL_STATE_PARTS.empty} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('announces a failed status tool as an alert', async () => {
    const { container } = render(
      <ToolPartsRenderer variant='chat' parts={TOOL_STATE_PARTS.error} />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-tool-state', 'failed');
    expect(alert).toHaveTextContent('Press source could not be loaded.');
    await expectNoA11yViolations(container);
  });

  it('keeps a saved and a failed call in one timeline', async () => {
    const { container } = render(
      <ToolPartsRenderer variant='chat' parts={TOOL_STATE_PARTS.partial} />
    );

    const feed = screen.getByTestId('tool-activity-feed');
    expect(feed).toHaveAttribute('data-tool-count', '2');
    expect(within(feed).getByRole('status')).toHaveAttribute(
      'data-operation-status',
      'succeeded'
    );
    expect(within(feed).getByRole('alert')).toHaveTextContent(
      'Second press source could not be loaded.'
    );
    expect(screen.getAllByTestId('tool-activity-timeline-line')).toHaveLength(
      2
    );
    await expectNoA11yViolations(container);
  });

  it('truncates long summaries but keeps them in the row title', async () => {
    const { container } = render(
      <ToolPartsRenderer variant='chat' parts={TOOL_STATE_PARTS.longContent} />
    );

    const rows = screen.getAllByTestId('tool-status-row');
    expect(rows).toHaveLength(4);
    const body = rows[0].querySelector('.system-b-chat-activity-body');
    expect(body).toHaveClass('truncate');
    expect(body?.getAttribute('title')).toMatch(
      /Midnight Drive \(Deluxe Anniversary Edition\)/
    );
    await expectNoA11yViolations(container);
  });

  it('names an unreachable service with its retry next step', async () => {
    const { container } = render(
      <ToolPartsRenderer variant='chat' parts={TOOL_STATE_PARTS.offline} />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The press source could not be reached.');
    expect(alert).toHaveTextContent(
      'Retry in a few minutes or ask Jovie for an alternate approach.'
    );
    await expectNoA11yViolations(container);
  });

  it('shows a plan-locked tool with one working upgrade prompt', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ToolPartsRenderer
        variant='chat'
        parts={TOOL_STATE_PARTS.permissionDenied}
      />
    );

    expect(screen.getByTestId('tool-status-row')).toHaveAttribute(
      'data-tool-locked',
      'true'
    );
    expect(screen.getByText('Album art is a Max feature')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upgrade to Max' }));
    expect(upgrade).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean for a right-to-left receipt', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ToolPartsRenderer variant='chat' parts={TOOL_STATE_PARTS.rtl} />
      </div>
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'تم حفظ مصدر الصحافة.'
    );
    await expectNoA11yViolations(container);
  });
});
