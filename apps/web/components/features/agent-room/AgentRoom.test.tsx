import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentRoom, roomTimeAgo } from './AgentRoom';
import { fleetRoomFixtureView } from './fixtures';

describe('AgentRoom', () => {
  it('includes the full roster, activity, and composer in server HTML before hydration', () => {
    const view = fleetRoomFixtureView();
    const html = renderToStaticMarkup(
      <AgentRoom
        view={view}
        composer={
          <form>
            <button type='submit'>Send</button>
          </form>
        }
      />
    );
    const server = within(
      new DOMParser().parseFromString(html, 'text/html').body
    );

    expect(
      server
        .getAllByTestId('agent-room-agent')
        .map(agent => agent.dataset.agentId)
    ).toEqual(view.agents.map(agent => agent.id));
    expect(server.getAllByTestId('agent-room-event')).toHaveLength(
      view.events.length
    );
    expect(server.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'type',
      'submit'
    );
  });

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

  it('renders a composer slot under the feed when given one', () => {
    render(
      <AgentRoom
        view={fleetRoomFixtureView([])}
        composer={<form data-testid='slot-composer' />}
      />
    );
    expect(screen.getByTestId('slot-composer')).toBeInTheDocument();
  });

  it('gives each pane its own scroll container so the room fills the canvas', () => {
    const view = fleetRoomFixtureView();
    render(<AgentRoom view={view} />);

    // The room itself is bounded by its host and never asks the page to
    // scroll on desktop; each pane owns a scrolling region instead.
    const room = screen.getByTestId('agent-room');
    expect(room).toHaveClass('overflow-y-auto', 'lg:overflow-hidden');

    const roster = within(room).getByTestId('agent-roster');
    expect(roster).toHaveClass('overflow-y-auto');
    const rosterRows = within(roster).getAllByTestId('agent-room-agent');
    expect(rosterRows).toHaveLength(view.agents.length);

    const feed = within(room).getByTestId('agent-room-feed');
    expect(feed).toHaveClass('overflow-y-auto');
    const feedEvents = within(feed).getAllByTestId('agent-room-event');
    expect(feedEvents).toHaveLength(view.events.length);
  });

  it('pins the composer outside the scrolling feed', () => {
    render(
      <AgentRoom
        view={fleetRoomFixtureView()}
        composer={<form data-testid='slot-composer' />}
      />
    );
    const room = screen.getByTestId('agent-room');
    const feed = within(room).getByTestId('agent-room-feed');
    expect(feed).not.toContainElement(screen.getByTestId('slot-composer'));
  });
});
