'use client';

import { Button, NativeSelect, Textarea } from '@jovie/ui';
import { useActionState } from 'react';

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
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
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
          defaultValue=''
        />
      </div>
      <Textarea
        name='text'
        aria-label='Message'
        placeholder='Message the agent in its Linear thread'
        required
        maxLength={maxChars}
        rows={3}
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
