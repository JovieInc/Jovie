import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeshAgentSnapshot } from '@/lib/ovie/mesh/types';
import { MeshAgentRail } from './MeshAgentRail';

const AGENT: MeshAgentSnapshot = {
  id: 'lola',
  label: 'Lola',
  receiveMode: 'direct',
  meshKind: 'lola',
  waitingOnTim: 'Rotation',
  status: 'stale',
  lastSentAt: '2026-10-20T12:00:00.000Z',
  lastReceivedAt: null,
  recentMessages: [
    {
      direction: 'sent',
      summary: 'Rotation ask forwarded',
      at: '2026-10-20T12:00:00.000Z',
    },
  ],
  gaps: ['Rotation approval pending'],
};

function renderRail(agent: MeshAgentSnapshot | null = AGENT, onPing = vi.fn()) {
  render(
    <MeshAgentRail
      agent={agent}
      isOpen
      onClose={vi.fn()}
      onPing={onPing}
      pingPending={false}
    />
  );
  return { onPing };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MeshAgentRail', () => {
  it('renders the agent EntityCard with receive mode and status', () => {
    renderRail();
    expect(screen.getByTestId('mesh-agent-entity-card')).toBeInTheDocument();
    expect(screen.getByText('Lola')).toBeInTheDocument();
    expect(screen.getByText('Receive mode: direct')).toBeInTheDocument();
  });

  it('shows the last messages, open asks, and watcher gaps', () => {
    renderRail();
    expect(screen.getByText('Rotation ask forwarded')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-waiting-on-tim')).toHaveTextContent(
      'Waiting on Tim: Rotation'
    );
    expect(screen.getByTestId('mesh-watcher-gap')).toHaveTextContent(
      'Rotation approval pending'
    );
  });

  it('degrades every section to unknown when sources are unavailable', () => {
    renderRail({
      ...AGENT,
      status: 'unknown',
      recentMessages: null,
      gaps: null,
      lastSentAt: null,
      lastReceivedAt: null,
      waitingOnTim: null,
    });
    expect(screen.getAllByText('Mailbox unavailable.').length).toBeGreaterThan(
      0
    );
    expect(screen.getByText('Watcher log unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Nothing waiting on Tim.')).toBeInTheDocument();
    expect(screen.getAllByText('unknown').length).toBeGreaterThan(0);
  });

  it('sends a ping through the capped server endpoint', () => {
    const { onPing } = renderRail();
    fireEvent.click(screen.getByTestId('mesh-ping-button'));
    expect(onPing).toHaveBeenCalledWith('lola');
  });

  it('disables the ping while a ping is in flight', () => {
    render(
      <MeshAgentRail
        agent={AGENT}
        isOpen
        onClose={vi.fn()}
        onPing={vi.fn()}
        pingPending
      />
    );
    expect(screen.getByTestId('mesh-ping-button')).toBeDisabled();
  });

  it('disables the ping for agents that are not mesh recipients', () => {
    renderRail({ ...AGENT, meshKind: null });
    expect(screen.getByTestId('mesh-ping-button')).toBeDisabled();
  });

  it('renders an empty state when no agent is selected', () => {
    renderRail(null);
    expect(
      screen.getByText('Select an agent to view its mesh details.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('mesh-ping-button')).toBeDisabled();
  });
});
