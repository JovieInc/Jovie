import '@/styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxTourDateItem } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxTourDateRow } from './OpportunityInboxTourDateRow';

const item: OpportunityInboxTourDateItem = {
  id: 'tour-date-states-1',
  title: 'The Troubadour, Los Angeles',
  startDate: '2026-11-05',
  startTime: '20:00',
  venueName: 'The Troubadour',
  location: 'Los Angeles, CA',
  providerLabel: 'Bandsintown',
  status: 'pending',
};

/** Rendered states of the detected tour date row. */
const meta = {
  title: 'Dashboard/Opportunity Inbox/Tour Date Row/States',
  component: OpportunityInboxTourDateRow,
  parameters: { layout: 'padded' },
  args: { item, onConfirm: () => {}, onReject: () => {} },
} satisfies Meta<typeof OpportunityInboxTourDateRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const inFeedList: Decorator = function InFeedList(Story) {
  return (
    <ul className='m-0 w-full max-w-xl list-none p-0'>
      <Story />
    </ul>
  );
};

const inRtlFeedList: Decorator = function InRtlFeedList(Story) {
  return (
    <ul dir='rtl' lang='ar' className='m-0 w-full max-w-xl list-none p-0'>
      <Story />
    </ul>
  );
};

/** Loading: a decision is in flight, so both actions are disabled. */
export const LoadingBusy: Story = {
  args: { isBusy: true },
  decorators: [inFeedList],
};

/** Partial: the provider gave no start time. */
export const PartialNoStartTime: Story = {
  args: { item: { ...item, startTime: null } },
  decorators: [inFeedList],
};

/** Empty: the provider gave no venue or location text. */
export const EmptyVenueAndLocation: Story = {
  args: { item: { ...item, venueName: '', location: '' } },
  decorators: [inFeedList],
};

/** Long content: a title, venue and location past one line. */
export const LongContentTitleAndVenue: Story = {
  args: {
    item: {
      ...item,
      title:
        'Annual Midsummer Festival Of Independent Music, Main Stage, Late Night Set With Special Guests',
      venueName: 'The Grand Ballroom At The Historic Riverside Convention Hall',
      location: 'San Bernardino County, California, United States',
    },
  },
  decorators: [inFeedList],
};

/** Right-to-left: an Arabic title and venue in an Arabic document. */
export const RtlArabicTitle: Story = {
  args: {
    item: {
      ...item,
      title: 'حفل موسيقي في لوس أنجلوس',
      venueName: 'مسرح تروبادور',
      location: 'لوس أنجلوس',
    },
  },
  decorators: [inRtlFeedList],
};

/** Confirmed: the persistent green confirmation, with no confirm action. */
export const ConfirmedPersistent: Story = {
  args: { item: { ...item, status: 'confirmed' } },
  decorators: [inFeedList],
};
