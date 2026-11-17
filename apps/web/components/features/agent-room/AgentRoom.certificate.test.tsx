import type { AgentRoomEvent } from '@jovie/agent-transport-contracts/agent-room';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AgentRoom } from './AgentRoom';
import { FLEET_ROOM_FIXTURE_EVENTS, fleetRoomFixtureView } from './fixtures';

const [failure, ...rest] = FLEET_ROOM_FIXTURE_EVENTS;

describe('AgentRoom certificate', () => {
  it('renders the full room axe-clean and keeps thread links keyboard reachable', async () => {
    const user = userEvent.setup();
    const { container } = render(<AgentRoom view={fleetRoomFixtureView()} />);

    expect(screen.getByRole('region', { name: 'Agents' })).toBeInTheDocument();
    const activity = screen.getByRole('region', { name: 'Activity' });
    const links = within(activity).getAllByRole('link', { name: 'JOV-12296' });
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noreferrer');

    await user.tab();
    expect(links[0]).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('shows the unavailable reason as a status and keeps the roster', async () => {
    const { container } = render(
      <AgentRoom
        view={fleetRoomFixtureView([])}
        unavailableReason='Activity could not be read just now.'
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Activity could not be read just now.'
    );
    expect(screen.getAllByTestId('agent-room-agent').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No fleet messages yet/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('marks a failed event and shows the blocked agent excerpt', async () => {
    const { container } = render(
      <AgentRoom view={fleetRoomFixtureView([failure])} />
    );

    const [event] = screen.getAllByTestId('agent-room-event');
    expect(event).toHaveAttribute('data-kind', 'error');
    expect(within(event).getByText('Failed')).toBeInTheDocument();
    const codex = screen
      .getAllByTestId('agent-room-agent')
      .find(row => row.dataset.agentId === 'codex');
    expect(codex).toHaveAttribute('data-presence', 'blocked');
    expect(
      within(codex as HTMLElement).getByText(failure.excerpt)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the empty-room guidance', async () => {
    const { container } = render(<AgentRoom view={fleetRoomFixtureView([])} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'No fleet messages yet'
    );
    expect(screen.queryAllByTestId('agent-room-event')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('renders a thread without a url as plain text', async () => {
    const plain: AgentRoomEvent = {
      ...rest[0],
      id: 'linear-comment:plain-1',
      thread: { ref: 'JOV-1', title: null, url: null },
    };
    const { container } = render(
      <AgentRoom view={fleetRoomFixtureView([plain])} />
    );

    const [event] = screen.getAllByTestId('agent-room-event');
    expect(within(event).getByText('JOV-1')).toBeInTheDocument();
    expect(within(event).queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long excerpts whole and renders in a right-to-left document', async () => {
    const long = `${rest[0].excerpt} ${'And the acceptance checks stay separate. '.repeat(6)}`;
    const { container } = render(
      <div dir='rtl'>
        <AgentRoom
          view={fleetRoomFixtureView([{ ...rest[0], excerpt: long }])}
        />
      </div>
    );

    expect(screen.getByText(long.trim())).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
