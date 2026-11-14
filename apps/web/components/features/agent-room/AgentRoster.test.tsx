import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentRoster } from './AgentRoster';
import { fleetRoomFixtureView } from './fixtures';

describe('AgentRoster', () => {
  it('renders one dense 44px row per agent with name, platform role and presence state', () => {
    const view = fleetRoomFixtureView();
    render(<AgentRoster agents={view.agents} />);

    const rows = screen.getAllByTestId('agent-room-agent');
    expect(rows).toHaveLength(view.agents.length);
    for (const row of rows) {
      expect(row).toHaveClass('min-h-11');
      expect(row).toBeVisible();
    }

    const codex = rows.find(row => row.dataset.agentId === 'codex');
    expect(codex).toBeDefined();
    expect(within(codex!).getByText('Codex')).toBeInTheDocument();
    expect(within(codex!).getByText('Linear agent app')).toBeInTheDocument();
    expect(within(codex!).getByText('Blocked')).toBeInTheDocument();
    expect(codex).toHaveAttribute('data-presence', 'blocked');
  });

  it('keeps liveness distinct from recent activity and unknown observations', () => {
    const view = fleetRoomFixtureView();
    render(<AgentRoster agents={view.agents} />);

    const rows = screen.getAllByTestId('agent-room-agent');
    const elsa = rows.find(row => row.dataset.agentId === 'elsa');
    expect(elsa).toHaveAttribute('data-presence', 'active');
    expect(within(elsa!).getByText('Active')).toBeInTheDocument();

    // Nobody spoke for the roster-only agents, and the room store has no
    // events for them: they read as their own states, never as active.
    const unseen = rows.filter(row => row.dataset.presence === 'unseen');
    for (const row of unseen) {
      expect(within(row).getByText('Not seen')).toBeInTheDocument();
    }
  });

  it('surfaces the failure receipt only on blocked agents', () => {
    const view = fleetRoomFixtureView();
    render(<AgentRoster agents={view.agents} />);

    const rows = screen.getAllByTestId('agent-room-agent');
    const blockedRows = rows.filter(row => row.dataset.presence === 'blocked');
    expect(blockedRows.length).toBeGreaterThan(0);
    for (const row of blockedRows) {
      expect(
        within(row).getByText(/couldn't start a task/u)
      ).toBeInTheDocument();
    }
    const unblocked = rows.filter(row => row.dataset.presence !== 'blocked');
    for (const row of unblocked) {
      expect(within(row).queryByText(/couldn't start a task/u)).toBeNull();
    }
  });

  it('renders an empty roster as quiet structure', () => {
    render(<AgentRoster agents={[]} />);
    expect(screen.getByTestId('agent-roster')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-room-agent')).toBeNull();
  });
});
