import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/jovie/components/ChatMessage', () => ({
  ChatMessage: ({ id }: Pick<ComponentProps<'div'>, 'id'>) => (
    <div data-testid={`fixture-message-${id}`}>{id}</div>
  ),
}));

import {
  CHAT_PLAYGROUND_IMPROVEMENTS,
  CHAT_PLAYGROUND_SCENARIOS,
  ChatUiPlayground,
} from './ChatUiPlayground';

describe('ChatUiPlayground', () => {
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
});
