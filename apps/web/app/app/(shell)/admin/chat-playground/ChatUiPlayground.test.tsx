import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToolPartsRenderer } from '@/components/jovie/tool-ui';
import type { MessagePart } from '@/components/jovie/types';

const { confirmLink } = vi.hoisted(() => ({ confirmLink: vi.fn() }));
vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useConfirmChatLinkMutation: () => ({ mutate: confirmLink }),
}));

vi.mock('@/components/jovie/components/ChatMessage', () => ({
  ChatMessage: ({
    id,
    parts,
  }: Pick<ComponentProps<'div'>, 'id'> & { parts: readonly MessagePart[] }) => (
    <div data-testid={`fixture-message-${id}`}>
      {id === 'playground-tool-running' ? (
        <ToolPartsRenderer parts={parts} variant='chat' />
      ) : (
        id
      )}
    </div>
  ),
}));

import {
  CHAT_PLAYGROUND_IMPROVEMENTS,
  CHAT_PLAYGROUND_SCENARIOS,
  ChatUiPlayground,
} from './ChatUiPlayground';

describe('ChatUiPlayground', () => {
  it('confirms the interactive proposal locally without a real mutation', async () => {
    confirmLink.mockClear();
    const user = userEvent.setup();
    render(<ChatUiPlayground />);
    await user.click(
      screen.getByRole('button', { name: 'Approvals and outcomes' })
    );
    const proposal = within(screen.getByLabelText('Interactive Proposal'));
    await user.click(proposal.getByRole('button', { name: 'Add' }));
    expect(confirmLink).not.toHaveBeenCalled();
    expect(proposal.getByText('Spotify link added')).toBeInTheDocument();
  });
  it('uses the canonical running tool presentation without an unsupported summary', async () => {
    const user = userEvent.setup();
    render(<ChatUiPlayground />);
    await user.click(screen.getByRole('button', { name: 'Tool lifecycle' }));
    const running = within(screen.getByLabelText('Running'));
    expect(running.getByText('Inspecting that source…')).toBeInTheDocument();
    expect(
      running.queryByText('Reading the supplied press page.')
    ).not.toBeInTheDocument();
  });
  it('keeps the critical state inventory and cleanup proposal connected', () => {
    expect(
      CHAT_PLAYGROUND_SCENARIOS.flatMap(scenario => scenario.coverage)
    ).toEqual([
      'message-lifecycle',
      'streaming',
      'long-content',
      'compact-mobile',
      'tool-lifecycle',
      'grouped-tools',
      'approvals',
      'image-generation',
      'entity-outcomes',
      'upload-context',
      'connection-terminal',
      'shell-states',
    ]);

    const scenarioIds = new Set(
      CHAT_PLAYGROUND_SCENARIOS.map(scenario => scenario.id)
    );
    for (const improvement of CHAT_PLAYGROUND_IMPROVEMENTS) {
      expect(improvement.scenarioIds.length).toBeGreaterThan(0);
      for (const scenarioId of improvement.scenarioIds) {
        expect(scenarioIds.has(scenarioId)).toBe(true);
      }
    }
  });

  it('filters scenarios, switches with native keyboard focus, and keeps preview geometry', async () => {
    const user = userEvent.setup();
    render(<ChatUiPlayground />);

    const preview = screen.getByTestId('chat-playground-preview');
    expect(preview).toHaveAttribute('data-scenario-id', 'message-lifecycle');
    expect(preview.style.minHeight).toBe('42rem');

    const search = screen.getByRole('searchbox', {
      name: 'Search Scenarios',
    });
    await user.type(search, 'shell-states');
    expect(screen.getByText('1 of 12 scenarios')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Shell and access states' })
    ).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'permission denied');
    expect(screen.getByText('1 of 12 scenarios')).toBeInTheDocument();

    const accessScenario = screen.getByRole('button', {
      name: 'Shell and access states',
    });
    accessScenario.focus();
    await user.keyboard('{Enter}');

    expect(accessScenario).toHaveFocus();
    expect(preview).toHaveAttribute('data-scenario-id', 'shell-states');
    expect(
      within(preview).getByLabelText('Permission Denied')
    ).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'no matching scenario');
    expect(
      screen.getByText('No scenarios match this search.')
    ).toBeInTheDocument();
    expect(preview).toHaveAttribute('data-scenario-id', 'shell-states');
    expect(preview.style.minHeight).toBe('42rem');
  });

  it('renders alternate message and compact fixtures from the catalog', async () => {
    const user = userEvent.setup();
    render(<ChatUiPlayground />);

    const preview = screen.getByTestId('chat-playground-preview');

    await user.click(
      screen.getByRole('button', { name: 'Thinking and streaming' })
    );
    expect(preview).toHaveAttribute('data-scenario-id', 'streaming');
    expect(within(preview).getByLabelText('Pending Reply')).toBeInTheDocument();
    expect(
      within(preview).getByLabelText('Streaming Reply')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Long content' }));
    expect(preview).toHaveAttribute('data-scenario-id', 'long-content');
    expect(
      within(preview).getByTestId('fixture-message-playground-long-content')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Compact and mobile' })
    );
    expect(preview).toHaveAttribute('data-scenario-id', 'compact-mobile');
    const compactMessage = within(preview).getByTestId(
      'fixture-message-playground-mobile-user'
    );
    expect(compactMessage.closest('[data-viewport]')).toHaveAttribute(
      'data-viewport',
      'compact'
    );
  });
});
