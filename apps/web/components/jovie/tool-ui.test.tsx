import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toolEventToMessagePart } from '@/lib/chat/tool-events';
import {
  buildFailedToolEvent,
  buildRunningToolEvent,
  buildSucceededToolEvent,
} from '@/lib/onboarding/presence-build/tool-events';
import { ToolPartsRenderer } from './tool-ui';

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
