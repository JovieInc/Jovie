'use client';

import { Button, NativeSelect, Textarea } from '@jovie/ui';
import { startTransition, useActionState, useState } from 'react';

export type AgentRoomComposerState =
  | { readonly status: 'idle' }
  | { readonly status: 'sent' | 'error'; readonly message: string };

export interface AgentRoomComposerProps {
  /** Agents that can be messaged: each has a thread to post in. */
  readonly agents: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly action: (
    previous: AgentRoomComposerState,
    formData: FormData
  ) => Promise<AgentRoomComposerState>;
  readonly maxChars?: number;
}

const IDLE: AgentRoomComposerState = { status: 'idle' };

/** Talk to one agent. The room renders the message when its source echoes it. */
export function AgentRoomComposer({
  agents,
  action,
  maxChars = 2_000,
}: Readonly<AgentRoomComposerProps>) {
  // Submit through onSubmit, not the form's action prop: a form action resets
  // the form when it settles, so a failed send would wipe the unsent message.
  // The fields are controlled, and the message clears only once it is sent.
  const [agentId, setAgentId] = useState('');
  const [text, setText] = useState('');
  const [state, formAction, pending] = useActionState(
    async (previous: AgentRoomComposerState, formData: FormData) => {
      const sent = String(formData.get('text') ?? '');
      const next = await action(previous, formData);
      // Clear only what was sent: text typed while the send ran stays.
      if (next.status === 'sent') {
        setText(current => (current === sent ? '' : current));
      }
      return next;
    },
    IDLE
  );
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className='flex flex-col gap-2 border-t border-subtle px-3 py-3'
      data-testid='agent-room-composer'
    >
      <div className='flex items-end gap-2'>
        <NativeSelect
          name='agentId'
          label='To'
          required
          options={agents.map(agent => ({
            value: agent.id,
            label: agent.name,
          }))}
          placeholder='Choose an agent'
          value={agentId}
          onChange={event => setAgentId(event.target.value)}
        />
      </div>
      <Textarea
        name='text'
        aria-label='Message'
        placeholder='Message the agent in its Linear thread'
        required
        maxLength={maxChars}
        rows={3}
        value={text}
        onChange={event => setText(event.target.value)}
      />
      <div className='flex items-center justify-between gap-2'>
        <p
          className='text-2xs text-secondary-token'
          role='status'
          aria-live='polite'
        >
          {state.status === 'idle' ? '' : state.message}
        </p>
        <Button type='submit' size='sm' disabled={pending}>
          {pending ? 'Sending' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
