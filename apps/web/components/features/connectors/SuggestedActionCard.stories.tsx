import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SuggestedActionCard } from './SuggestedActionCard';

const meta: Meta<typeof SuggestedActionCard> = {
  title: 'Features/Connectors/SuggestedActionCard',
  component: SuggestedActionCard,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof SuggestedActionCard>;

const BASE_ACTION = {
  id: 'suggestion',
  title: 'Late Set at Public Records',
  startsAt: '2026-08-22T20:00:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  venueName: 'Public Records',
  city: 'Brooklyn',
  region: 'NY',
  country: 'US',
  rationale: 'The confirmation includes a venue and set time.',
  sourceRef: {
    messageId: 'message-1',
    subject: 'Booking confirmed for August 22',
  },
} as const;

const STATES = [
  { status: 'pending', confidence: 0.96 },
  { status: 'executed', confidence: 0.82 },
  { status: 'failed', confidence: 0.55 },
] as const;

export const StateMatrix: Story = {
  render: () => (
    <div className='grid w-full max-w-5xl gap-3 md:grid-cols-3'>
      {STATES.map(state => (
        <SuggestedActionCard
          key={state.status}
          {...BASE_ACTION}
          id={`${BASE_ACTION.id}-${state.status}`}
          {...state}
          onApprove={fn()}
          onReject={fn()}
        />
      ))}
    </div>
  ),
};
