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

describe('ToolPartsRenderer library opportunities', () => {
  it('reserves the presence artifact slot while Library lookup is running', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[toolEventToMessagePart(buildRunningToolEvent(LIBRARY_STEP))]}
      />
    );

    expect(
      screen.getByTestId('chat-generation-artifact-surface')
    ).toBeInTheDocument();
    expect(screen.getByText('Library opportunities')).toBeInTheDocument();
    const loading = screen.getByTestId('chat-presence-artifact-loading');
    expect(loading).toHaveClass('min-h-16');
    expect(screen.getByText('Running…')).toBeInTheDocument();
  });

  it('renders truthful Library facts without sending or inventing stats', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart(
            buildSucceededToolEvent(LIBRARY_STEP, {
              title: 'Library opportunities',
              summary:
                'Your Library presence queue is ready. Findings stay local and nothing was sent.',
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

  it('keeps the failed Library artifact in the same card family', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart(
            buildFailedToolEvent(
              LIBRARY_STEP,
              'Library presence lookup failed.'
            )
          ),
        ]}
      />
    );

    expect(
      screen.getByText('Library opportunities failed')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Library presence lookup failed.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try again' })
    ).not.toBeInTheDocument();
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
});
