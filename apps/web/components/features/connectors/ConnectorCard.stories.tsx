import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ConnectorCard } from './ConnectorCard';

const meta: Meta<typeof ConnectorCard> = {
  title: 'Features/Connectors/ConnectorCard',
  component: ConnectorCard,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ConnectorCard>;

const STATES = [
  { status: 'not_connected' },
  { status: 'connected', email: 'artist@example.com' },
  { status: 'syncing', email: 'artist@example.com' },
  { status: 'error', errorMessage: 'Google rejected the connection.' },
  {
    status: 'needs_reauth',
    errorMessage: 'Google access expired. Reconnect to continue.',
  },
  { status: 'disabled' },
] as const;

export const StateMatrix: Story = {
  render: () => (
    <div className='w-full max-w-2xl divide-y divide-subtle rounded-lg bg-surface-1 px-4'>
      {STATES.map(state => (
        <ConnectorCard
          key={state.status}
          provider='gmail'
          {...state}
          onConnect={fn()}
          onDisconnect={fn()}
        />
      ))}
    </div>
  ),
};
