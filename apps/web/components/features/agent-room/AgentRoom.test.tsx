import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentRoom, roomTimeAgo } from './AgentRoom';
import { fleetRoomFixtureView } from './fixtures';

describe('AgentRoom', () => {
  it('shows every roster agent with presence and the feed newest first', () => {
    render(<AgentRoom view={fleetRoomFixtureView()} />);
    const agents = screen.getAllByTestId('agent-room-agent');
    expect(agents.map(a => a.dataset.agentId).slice(0, 3)).toEqual([
      'codex', // blocked: its last message is a failure
      'elsa', // active within 30 minutes
      'summer', // recent, and first in roster order
    ]);
    expect(agents[0].dataset.presence).toBe('blocked');
    expect(within(agents[0]).getByText('Blocked')).toBeInTheDocument();
    const events = screen.getAllByTestId('agent-room-event');
    expect(events).toHaveLength(6);
    expect(events[0].dataset.kind).toBe('error');
    expect(within(events[1]).getByText('to Fleet')).toBeInTheDocument();
    expect(
      within(events[1]).getByRole('link', { name: 'JOV-12296' })
    ).toHaveAttribute('href', 'https://linear.app/jovie/issue/JOV-12296');
  });

  it('keeps the roster and states why when activity is unavailable', () => {
    render(
      <AgentRoom
        view={fleetRoomFixtureView([])}
        unavailableReason='Activity could not be read just now.'
      />
    );
    expect(screen.getAllByTestId('agent-room-agent').length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Activity could not be read just now.'
    );
    expect(screen.queryAllByTestId('agent-room-event')).toHaveLength(0);
  });

  it('renders an empty room with the posting convention', () => {
    render(<AgentRoom view={fleetRoomFixtureView([])} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'name who the message is from and to'
    );
  });

  it('formats relative time from the view clock, not the wall clock', () => {
    const now = '2026-11-11T20:00:00.000Z';
    expect(roomTimeAgo('2026-11-11T19:59:30.000Z', now)).toBe('just now');
    expect(roomTimeAgo('2026-11-11T19:15:00.000Z', now)).toBe('45m ago');
    expect(roomTimeAgo('2026-11-11T10:00:00.000Z', now)).toBe('10h ago');
    expect(roomTimeAgo('2026-11-08T20:00:00.000Z', now)).toBe('3d ago');
    expect(roomTimeAgo(null, now)).toBe('never');
  });
});
