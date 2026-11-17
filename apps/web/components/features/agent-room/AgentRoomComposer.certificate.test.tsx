import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  AgentRoomComposer,
  type AgentRoomComposerState,
} from './AgentRoomComposer';

const AGENTS = [
  { id: 'summer', name: 'Summer' },
  { id: 'chloe', name: 'Chloe' },
];

const sent = async (): Promise<AgentRoomComposerState> => ({
  status: 'sent',
  message: 'Posted in JOV-12296.',
});

describe('AgentRoomComposer certificate', () => {
  it('keeps typed text and focus across a parent re-render and Escape', async () => {
    const user = userEvent.setup();
    const { rerender, container } = render(
      <AgentRoomComposer agents={AGENTS} action={sent} />
    );
    const message = screen.getByLabelText('Message');

    await user.type(message, 'draft in progress');
    rerender(<AgentRoomComposer agents={[...AGENTS]} action={sent} />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Message')).toHaveValue('draft in progress');
    expect(screen.getByLabelText('Message')).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('shows Sending and disables the button while a send is pending', async () => {
    const user = userEvent.setup();
    let finish: (state: AgentRoomComposerState) => void = () => undefined;
    const action = vi.fn(
      () =>
        new Promise<AgentRoomComposerState>(resolve => {
          finish = resolve;
        })
    );
    const { container } = render(
      <AgentRoomComposer agents={AGENTS} action={action} />
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /^To/ }),
      'chloe'
    );
    await user.type(screen.getByLabelText('Message'), 'status?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByRole('button', { name: 'Sending' })
    ).toBeDisabled();
    expect(action).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
    // Settle the send: React entangles pending async transitions.
    finish({ status: 'sent', message: 'Posted in JOV-12296.' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    );
  });

  it('offers only the placeholder when there are no agents', async () => {
    const { container } = render(
      <AgentRoomComposer agents={[]} action={sent} />
    );

    expect(
      screen.getAllByRole('option').map(option => option.textContent)
    ).toEqual(['Choose an agent']);
    await expectNoA11yViolations(container);
  });

  it('keeps the message after an offline failure', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AgentRoomComposer
        agents={AGENTS}
        action={async () => ({
          status: 'error',
          message: 'You are offline. The message is kept.',
        })}
      />
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /^To/ }),
      'summer'
    );
    await user.type(screen.getByLabelText('Message'), 'status?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'You are offline. The message is kept.'
      )
    );
    expect(screen.getByLabelText('Message')).toHaveValue('status?');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with long and right-to-left agent names', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AgentRoomComposer
          agents={[
            { id: 'layla', name: 'ليلى' },
            {
              id: 'ops',
              name: 'Release operations agent for the spring catalog campaign',
            },
          ]}
          action={sent}
        />
      </div>
    );

    expect(screen.getByRole('option', { name: 'ليلى' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
