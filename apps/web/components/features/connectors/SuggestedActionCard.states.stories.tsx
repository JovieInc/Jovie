import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SuggestedActionCard } from './SuggestedActionCard';

/**
 * State coverage for a suggested calendar action. The status matrix stays in
 * SuggestedActionCard.stories.tsx; each story here isolates one state.
 */
const meta: Meta<typeof SuggestedActionCard> = {
  title: 'Features/Connectors/SuggestedActionCard States',
  component: SuggestedActionCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    id: 'suggestion',
    title: 'Late Set at Public Records',
    startsAt: '2026-08-22T20:00:00.000Z',
    endsAt: '2026-08-22T22:00:00.000Z',
    venueName: 'Public Records',
    city: 'Brooklyn',
    region: 'NY',
    country: 'US',
    confidence: 0.96,
    rationale: 'The confirmation includes a venue and set time.',
    sourceRef: {
      messageId: 'message-1',
      subject: 'Booking confirmed for August 22',
    },
    status: 'pending',
    onApprove: fn(),
    onReject: fn(),
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SuggestedActionCard>;

/** Empty: the email gave no usable date, place or subject. */
export const EmptyDetails: Story = {
  args: {
    startsAt: 'TBD',
    endsAt: null,
    venueName: null,
    city: null,
    region: null,
    country: null,
    sourceRef: { messageId: 'message-2', subject: '   ' },
    confidence: 0.4,
  },
};

/** Error: the approved action failed to run. */
export const ErrorFailed: Story = {
  args: { status: 'failed', confidence: 0.55 },
};

/** Partial: a date-only booking with just a city. */
export const PartialLocation: Story = {
  args: {
    startsAt: '2026-08-22',
    endsAt: null,
    venueName: null,
    region: null,
    country: null,
    confidence: 0.78,
  },
};

/** Long content: long title, venue, subject and rationale. */
export const LongContentDetails: Story = {
  args: {
    title:
      'Extended closing set at the Public Records Sound Room with a guest back-to-back',
    venueName: 'Public Records Sound Room and Upstairs Garden Terrace',
    sourceRef: {
      messageId: 'message-3',
      subject:
        'RE: RE: FWD: Booking confirmed for August 22, load-in, set times and guest list details',
    },
    rationale:
      'The confirmation names the venue, the room, a load-in time and a set time, and the promoter signed it off in the latest reply on the thread.',
  },
};

/** Read-only: no approve or reject handler is wired, so both are disabled. */
export const ReadOnlyNoHandlers: Story = {
  args: { onApprove: undefined, onReject: undefined },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  args: { title: 'عرض متأخر في Public Records' },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
