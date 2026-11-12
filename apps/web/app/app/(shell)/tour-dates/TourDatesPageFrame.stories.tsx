import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';
import { TourDatesPageFrame } from './TourDatesPageFrame';

type TourRow = {
  readonly id: string;
  readonly date: string;
  readonly venue: string;
  readonly city: string;
};

const LONG_ROWS: readonly TourRow[] = Array.from({ length: 24 }, (_, i) => ({
  id: `show-${i + 1}`,
  date: `2027-0${(i % 9) + 1}-1${i % 10}`,
  venue:
    'The Grand Riverside Amphitheatre and Waterfront Festival Grounds, Main Stage North',
  city: 'Llanfairpwllgwyngyll, Isle of Anglesey, United Kingdom',
}));

const RTL_ROWS: readonly TourRow[] = [
  { id: 'dxb', date: '2027-03-12', venue: 'دار أوبرا دبي', city: 'دبي' },
  {
    id: 'tlv',
    date: '2027-03-19',
    venue: 'היכל מנורה מבטחים',
    city: 'תל אביב',
  },
  { id: 'cai', date: '2027-03-26', venue: 'مسرح الأزهر', city: 'القاهرة' },
];

/** Stand-in for TourDatesPageClient's table: the frame owns only the page. */
function TourRows({ rows }: { readonly rows: readonly TourRow[] }) {
  return (
    <ul className='divide-y divide-subtle'>
      {rows.map(row => (
        <li
          key={row.id}
          className='grid min-w-0 grid-cols-4 gap-3 px-4 py-2 text-sm text-primary-token'
        >
          <span className='text-secondary-token'>{row.date}</span>
          <span className='col-span-2 min-w-0 truncate'>{row.venue}</span>
          <span className='min-w-0 truncate'>{row.city}</span>
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: 'App/Tour Dates/Page Frame',
  component: TourDatesPageFrame,
  parameters: { layout: 'fullscreen' },
  args: {
    testId: 'tour-dates-page',
    children: <DashboardSegmentSkeleton variant='tour' />,
  },
  render: args => (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      <TourDatesPageFrame {...args} />
    </div>
  ),
} satisfies Meta<typeof TourDatesPageFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The frame holding the tour-shaped segment skeleton on first boot. */
export const LoadingTourDates: Story = {};

/** Two dozen shows with long venue and city names: rows truncate, page scrolls. */
export const LongContentManyShows: Story = {
  args: { children: <TourRows rows={LONG_ROWS} /> },
};

/** Arabic and Hebrew venues in a right-to-left document. */
export const RtlArabicHebrewVenues: Story = {
  args: { children: <TourRows rows={RTL_ROWS} /> },
  render: args => (
    <div
      dir='rtl'
      lang='ar'
      className='relative flex h-160 w-full overflow-hidden bg-base'
    >
      <TourDatesPageFrame {...args} />
    </div>
  ),
};
