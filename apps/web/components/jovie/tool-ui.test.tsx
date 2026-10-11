import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { toolEventToMessagePart } from '@/lib/chat/tool-events';
import {
  buildFailedToolEvent,
  buildRunningToolEvent,
  buildSucceededToolEvent,
} from '@/lib/onboarding/presence-build/tool-events';
import { ToolPartsRenderer } from './tool-ui';

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children?: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

vi.mock('@/lib/chat/locked-tools', () => {
  throw new Error(
    'tool-ui must not import server analytics through locked-tools'
  );
});

const LIBRARY_STEP = 'surface_library_opportunities' as const;

const libraryFacts = [
  { label: 'Repair queue', value: '1 open' },
  { label: 'Collisions', value: '0 to review' },
  { label: 'Placement opportunities', value: '0 found' },
  { label: 'Rightsholders', value: '0 observed' },
  { label: 'Downloads', value: 'No attested files live' },
  { label: 'Stats', value: 'Not connected' },
] as const;

describe('ToolPartsRenderer work opportunities', () => {
  it('reserves the presence artifact slot while Work lookup is running', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[toolEventToMessagePart(buildRunningToolEvent(LIBRARY_STEP))]}
      />
    );

    expect(
      screen.getByTestId('chat-generation-artifact-surface')
    ).toBeInTheDocument();
    expect(screen.getByText('Work opportunities')).toBeInTheDocument();
    const loading = screen.getByTestId('chat-presence-artifact-loading');
    expect(loading).toHaveClass('min-h-16');
    expect(screen.getByText('Running…')).toBeInTheDocument();
  });

  it('renders truthful Work facts without sending or inventing stats', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart(
            buildSucceededToolEvent(LIBRARY_STEP, {
              title: 'Work opportunities',
              summary:
                'Your Work opportunity queue is ready. Findings stay local and nothing was sent.',
              facts: [...libraryFacts],
            })
          ),
        ]}
      />
    );

    const success = screen.getByTestId('chat-presence-artifact-success');
    expect(success).toHaveClass('min-h-16');
    expect(screen.getByText('Repair queue')).toBeInTheDocument();
    expect(screen.getByText('1 open')).toBeInTheDocument();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText(/nothing was sent/i)).toBeInTheDocument();
    expect(success.textContent).not.toMatch(/streams|revenue|license/i);
  });

  it('keeps the failed Work artifact in the same card family', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart(
            buildFailedToolEvent(LIBRARY_STEP, 'Work presence lookup failed.')
          ),
        ]}
      />
    );

    expect(screen.getByText('Work opportunities failed')).toBeInTheDocument();
    expect(
      screen.getByText('Work presence lookup failed.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try again' })
    ).not.toBeInTheDocument();
  });
});

describe('ToolPartsRenderer link check', () => {
  it('renders sourced link-drift findings in the presence artifact card', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart(
            buildSucceededToolEvent('check_link_drift', {
              title: 'Link check',
              summary: 'Found 1 thing on your link-in-bio page to fix.',
              facts: [
                {
                  label: 'Bio link',
                  value:
                    'Points to “Old Single” (Mar 2025). Your latest, “New Single”, came out Sep 2026.',
                  source:
                    'https://bio.example/a vs https://open.spotify.com/artist/x',
                  observedAt: '2026-10-04T00:00:00.000Z',
                },
              ],
            })
          ),
        ]}
      />
    );

    const success = screen.getByTestId('chat-presence-artifact-success');
    expect(screen.getByText('Link check')).toBeInTheDocument();
    expect(screen.getByText('Bio link')).toBeInTheDocument();
    expect(success).toHaveTextContent('Your latest, “New Single”');
  });

  it('shows the link check loading state in the same reserved slot', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart(buildRunningToolEvent('check_link_drift')),
        ]}
      />
    );
    expect(screen.getByTestId('chat-presence-artifact-loading')).toHaveClass(
      'min-h-16'
    );
  });
});

describe('ToolPartsRenderer ops data cards', () => {
  it('renders a summer.ops-card.v1 payload as an ops data card', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          {
            type: 'dynamic-tool',
            toolName: 'summer_ops_snapshot',
            toolCallId: 'tool-ops-card',
            state: 'output-available',
            input: {},
            output: {
              success: true,
              summary: 'Shipping read complete.',
              card: {
                schema: 'summer.ops-card.v1',
                kind: 'shipping',
                title: 'Shipping lanes',
                state: 'fresh',
                observedAt: '2026-09-27T09:00:00.000Z',
                source: 'ubuntu-operational-truth',
                facts: [{ label: 'Merge queue', value: '3' }],
                series: {
                  label: 'Live counts',
                  points: [{ label: 'Queued', value: 3 }],
                },
              },
            },
          },
        ]}
      />
    );

    const card = screen.getByTestId('chat-ops-data-card');
    expect(card).toHaveAttribute('data-card-kind', 'shipping');
    expect(screen.getByText('Shipping lanes')).toBeInTheDocument();
    expect(screen.getByText('Shipping read complete.')).toBeInTheDocument();
    expect(screen.getByText('Merge queue')).toBeInTheDocument();
    expect(screen.getByTestId('chat-ops-data-card-chart')).toHaveTextContent(
      'Queued'
    );
  });

  it('falls back to a status row when the ops card payload is malformed', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          {
            type: 'dynamic-tool',
            toolName: 'summer_ops_snapshot',
            toolCallId: 'tool-ops-card-bad',
            state: 'output-available',
            input: {},
            output: {
              success: true,
              summary: 'Shipping read complete.',
              card: { schema: 'summer.ops-card.v1', kind: 'shipping' },
            },
          },
        ]}
      />
    );

    expect(screen.queryByTestId('chat-ops-data-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('tool-status-row')).toBeInTheDocument();
  });
});

describe('ToolPartsRenderer locked tool output', () => {
  it('renders the upgrade state through the client-safe lock contract', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          {
            type: 'dynamic-tool',
            toolName: 'generateAlbumArt',
            toolCallId: 'tool-locked-album-art',
            state: 'output-available',
            input: {},
            output: {
              success: true,
              locked: true,
              reason: 'Album art requires the Max plan.',
              plan_required: 'Max',
              upgrade_cta: 'Upgrade to Max to unlock album art.',
            },
          },
        ]}
      />
    );

    expect(screen.getByTestId('tool-status-row')).toHaveAttribute(
      'data-tool-locked',
      'true'
    );
    expect(screen.getByText('Album art is a Max feature')).toBeInTheDocument();
    expect(
      screen.getByText('Album art requires the Max plan.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upgrade to Max' })
    ).toBeInTheDocument();
  });

  it('falls back to the canonical Artist Presence plan when plan_required is absent', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          {
            type: 'dynamic-tool',
            toolName: 'generateAlbumArt',
            toolCallId: 'tool-locked-default-plan',
            state: 'output-available',
            input: {},
            output: {
              success: true,
              locked: true,
              reason: 'Album art requires a paid plan.',
            },
          },
        ]}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
  });
});
