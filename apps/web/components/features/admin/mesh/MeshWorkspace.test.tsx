import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useMeshReadQuery: vi.fn(),
  sendMeshPingRequest: vi.fn(),
  getMeshPingErrorMessage: vi.fn(() => 'Mesh ping failed. Try again.'),
}));

vi.mock('@/lib/queries/useMeshQuery', () => ({
  useMeshReadQuery: mocks.useMeshReadQuery,
  sendMeshPingRequest: mocks.sendMeshPingRequest,
  getMeshPingErrorMessage: mocks.getMeshPingErrorMessage,
}));

import { MeshWorkspace } from './MeshWorkspace';

const SNAPSHOT = {
  schema: 'jovie.mesh-read/v1',
  mailboxSource: 'ok',
  watcherSource: 'ok',
  agents: [
    {
      id: 'summer',
      label: 'Summer',
      receiveMode: 'direct',
      meshKind: 'summer',
      waitingOnTim: null,
      status: 'live',
      lastSentAt: '2026-10-23T18:00:00.000Z',
      lastReceivedAt: '2026-10-23T18:30:00.000Z',
      recentMessages: [
        {
          direction: 'received',
          summary: 'Daily brief delivered',
          at: '2026-10-23T18:30:00.000Z',
        },
      ],
      gaps: [],
    },
    {
      id: 'lola',
      label: 'Lola',
      receiveMode: 'direct',
      meshKind: 'lola',
      waitingOnTim: 'Rotation',
      status: 'stale',
      lastSentAt: null,
      lastReceivedAt: null,
      recentMessages: null,
      gaps: ['Rotation approval pending'],
    },
  ],
} as const;

function renderWorkspace() {
  return render(<MeshWorkspace />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useMeshReadQuery.mockReturnValue({
    data: SNAPSHOT,
    isLoading: false,
    isError: false,
    refetch: vi.fn().mockResolvedValue({}),
  });
  mocks.sendMeshPingRequest.mockResolvedValue(undefined);
});

describe('MeshWorkspace', () => {
  it('renders one read-only row per mesh agent', () => {
    renderWorkspace();
    expect(screen.getByTestId('mesh-row-summer')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-row-lola')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Status' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Receive mode' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Last sent' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Last received' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Waiting on Tim' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('mesh-waiting-cell')).toHaveTextContent(
      'Waiting on Tim: Rotation'
    );
  });

  it('opens the agent EntityCard rail from a row click', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByTestId('mesh-row-summer'));
    expect(await screen.findByTestId('mesh-agent-rail')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-agent-entity-card')).toBeInTheDocument();
    expect(screen.getByText('Daily brief delivered')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-waiting-on-tim')).toBeInTheDocument();
  });

  it('pings the selected agent through the capped server endpoint', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByTestId('mesh-row-summer'));
    fireEvent.click(await screen.findByTestId('mesh-ping-button'));
    await waitFor(() =>
      expect(mocks.sendMeshPingRequest).toHaveBeenCalledWith('summer')
    );
  });

  it('renders the unavailable-state row as unknown when the mesh source is down', () => {
    mocks.useMeshReadQuery.mockReturnValue({
      data: {
        ...SNAPSHOT,
        mailboxSource: 'unavailable',
        watcherSource: 'unavailable',
        agents: SNAPSHOT.agents.map(agent => ({
          ...agent,
          status: 'unknown',
          recentMessages: null,
          gaps: null,
          lastSentAt: null,
          lastReceivedAt: null,
        })),
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue({}),
    });
    renderWorkspace();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('offers a retry when the read API fails', () => {
    mocks.useMeshReadQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn().mockResolvedValue({}),
    });
    renderWorkspace();
    expect(screen.getByText('Mesh unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.useMeshReadQuery().refetch).toHaveBeenCalled();
  });
});
