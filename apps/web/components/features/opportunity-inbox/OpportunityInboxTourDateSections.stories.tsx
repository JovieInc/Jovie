import '@/styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxTourDateItem } from '@/lib/connectors/opportunity-inbox-types';
import {
  OpportunityInboxConfirmedTourDates,
  OpportunityInboxRejectedTourDates,
} from './OpportunityInboxTourDateSections';

const item: OpportunityInboxTourDateItem = {
  id: 'section-states-1',
  title: 'The Troubadour, Los Angeles',
  startDate: '2026-11-05',
  startTime: '20:00',
  venueName: 'The Troubadour',
  location: 'Los Angeles, CA',
  providerLabel: 'Bandsintown',
  status: 'confirmed',
};

/** Rendered states of the confirmed and rejected tour date sections. */
const meta = {
  title: 'Dashboard/Opportunity Inbox/Tour Date Sections/States',
  component: OpportunityInboxConfirmedTourDates,
  parameters: { layout: 'padded' },
  args: { items: [item] },
} satisfies Meta<typeof OpportunityInboxConfirmedTourDates>;

export default meta;
type Story = StoryObj<typeof meta>;

const withWidth: Decorator = function WithWidth(Story) {
  return (
    <div className='w-full max-w-xl'>
      <Story />
    </div>
  );
};

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-xl'>
      <Story />
    </div>
  );
};

/** Empty: no confirmed dates, so the section renders nothing. */
export const EmptyConfirmed: Story = {
  args: { items: [] },
  decorators: [withWidth],
};

/** Partial: a confirmed date with no start time or venue text. */
export const PartialConfirmedDate: Story = {
  args: { items: [{ ...item, startTime: null, venueName: '', location: '' }] },
  decorators: [withWidth],
};

/** Long content: a confirmed date whose title and venue overflow the row. */
export const LongContentConfirmedDate: Story = {
  args: {
    items: [
      {
        ...item,
        title:
          'Annual Midsummer Festival Of Independent Music, Main Stage, Late Night Set With Special Guests',
        venueName:
          'The Grand Ballroom At The Historic Riverside Convention Hall',
        location: 'San Bernardino County, California, United States',
      },
    ],
  },
  decorators: [withWidth],
};

/** Right-to-left: an Arabic confirmed date in an Arabic document. */
export const RtlArabicConfirmedDate: Story = {
  args: {
    items: [
      {
        ...item,
        title: 'حفل موسيقي في لوس أنجلوس',
        venueName: 'مسرح تروبادور',
        location: 'لوس أنجلوس',
      },
    ],
  },
  decorators: [withRtlDocument],
};

/** Loading: an undo is in flight for one rejected date. */
export const LoadingRejectedUndo: Story = {
  render: args => (
    <OpportunityInboxRejectedTourDates
      items={[{ ...item, status: 'rejected' }]}
      onUndoReject={() => {}}
      pendingUndoId={args.items[0]?.id ?? item.id}
    />
  ),
  decorators: [withWidth],
};

/** Partial: the rejected bucket with a date missing its start time. */
export const PartialRejectedDate: Story = {
  render: () => (
    <OpportunityInboxRejectedTourDates
      items={[{ ...item, status: 'rejected', startTime: null }]}
      onUndoReject={() => {}}
    />
  ),
  decorators: [withWidth],
};
