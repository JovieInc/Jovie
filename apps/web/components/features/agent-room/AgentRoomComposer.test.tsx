import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentRoomComposer,
  type AgentRoomComposerState,
} from './AgentRoomComposer';

const AGENTS = [
  { id: 'summer', name: 'Summer' },
  { id: 'chloe', name: 'Chloe' },
];

describe('AgentRoomComposer', () => {
  it('sends the chosen agent and text, then shows the result', async () => {
    const action = vi.fn(
      async (
        _previous: AgentRoomComposerState,
        formData: FormData
      ): Promise<AgentRoomComposerState> => ({
        status: 'sent',
        message: `Posted to ${String(formData.get('agentId'))}: ${String(formData.get('text'))}`,
      })
    );
    render(<AgentRoomComposer agents={AGENTS} action={action} maxChars={50} />);
    fireEvent.change(screen.getByRole('combobox', { name: /^To/ }), {
      target: { value: 'chloe' },
    });
    const message = screen.getByLabelText('Message');
    expect(message).toHaveAttribute('maxLength', '50');
    fireEvent.change(message, { target: { value: 'status?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Posted to chloe: status?'
      )
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it('keeps the unsent message and agent when the send fails', async () => {
    const action = vi.fn(
      async (): Promise<AgentRoomComposerState> => ({
        status: 'error',
        message: 'Linear did not take the message. Try again.',
      })
    );
    render(<AgentRoomComposer agents={AGENTS} action={action} />);
    const agent = screen.getByRole('combobox', { name: /^To/ });
    fireEvent.change(agent, { target: { value: 'chloe' } });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'status?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Linear did not take the message.'
      )
    );
    expect(screen.getByLabelText('Message')).toHaveValue('status?');
    expect(agent).toHaveValue('chloe');
  });

  it('lists only the agents it is given', () => {
    render(
      <AgentRoomComposer
        agents={AGENTS}
        action={async () => ({ status: 'idle' })}
      />
    );
    expect(
      screen.getAllByRole('option').map(option => option.textContent)
    ).toEqual(['Choose an agent', 'Summer', 'Chloe']);
  });
});
