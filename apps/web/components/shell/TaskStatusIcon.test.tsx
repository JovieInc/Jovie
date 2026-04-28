import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskStatusIcon } from './TaskStatusIcon';

describe('TaskStatusIcon', () => {
  it('renders the backlog glyph with the correct aria-label', () => {
    render(<TaskStatusIcon status='backlog' />);
    expect(screen.getByLabelText('Backlog')).toBeInTheDocument();
  });

  it('renders the todo glyph with the correct aria-label', () => {
    render(<TaskStatusIcon status='todo' />);
    expect(screen.getByLabelText('Todo')).toBeInTheDocument();
  });

  it('labels in-progress as live when agentRunning is true', () => {
    render(<TaskStatusIcon status='in_progress' agentRunning />);
    expect(
      screen.getByLabelText('In progress, agent running')
    ).toBeInTheDocument();
  });

  it('renders the done glyph as a filled circle with check', () => {
    render(<TaskStatusIcon status='done' />);
    expect(screen.getByLabelText('Done')).toBeInTheDocument();
  });

  it('renders the cancelled glyph', () => {
    render(<TaskStatusIcon status='cancelled' />);
    expect(screen.getByLabelText('Cancelled')).toBeInTheDocument();
  });
});
