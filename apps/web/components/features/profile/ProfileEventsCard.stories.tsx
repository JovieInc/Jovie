import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { resolveProfileModeCardAccents } from '@/lib/profile/mode-card-accent';
import { ProfileEventsCard } from './ProfileEventsCard';

const meta = {
  title: 'Profile/ProfileEventsCard',
  component: ProfileEventsCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-sm max-w-full bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    accent: resolveProfileModeCardAccents({ listenArtworkAccent: 'ultra' })
      .events,
    hasEvents: false,
  },
} satisfies Meta<typeof ProfileEventsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithEvents: Story = {
  args: {
    hasEvents: true,
    children: (
      <p className='text-mid text-(--profile-mode-card-fg)'>
        May 1 · The Echo, Los Angeles
      </p>
    ),
  },
};

const eventRowClassName = 'text-mid text-(--profile-mode-card-fg)';

/** Dates exist but one venue is not announced yet, so that row says so. */
export const PartialVenueNotAnnounced: Story = {
  args: {
    hasEvents: true,
    children: (
      <ul className='space-y-1'>
        <li className={eventRowClassName}>May 1 · The Echo, Los Angeles</li>
        <li className={eventRowClassName}>May 9 · Venue to be announced</li>
      </ul>
    ),
  },
};

const longTour = [
  'Jun 14 · Royal Albert Hall Elgar Room, Kensington Gore, London',
  'Jun 18 · Paradiso Grote Zaal, Weteringschans, Amsterdam',
  'Jun 21 · Columbiahalle Open Air Stage, Columbiadamm, Berlin',
  'Jun 25 · Le Trianon Salle de Spectacle, Boulevard de Rochechouart, Paris',
  'Jul 2 · Brooklyn Steel Main Room, Frost Street, Williamsburg, New York',
  'Jul 6 · The Fillmore Auditorium, Geary Boulevard, San Francisco',
  'Jul 11 · Massey Hall Allan Slaight Stage, Shuter Street, Toronto',
  'Jul 15 · Hollywood Palladium Grand Ballroom, Sunset Boulevard, Los Angeles',
];

/** A long tour with full venue names that wrap inside the card. */
export const LongContentTour: Story = {
  args: {
    hasEvents: true,
    children: (
      <ul className='space-y-1'>
        {longTour.map(row => (
          <li key={row} className={eventRowClassName}>
            {row}
          </li>
        ))}
      </ul>
    ),
  },
};

/** Arabic venue names in a right-to-left profile. */
export const RtlArabicVenues: Story = {
  args: {
    hasEvents: true,
    children: (
      <ul className='space-y-1'>
        <li className={eventRowClassName}>
          ١ مايو · دار الأوبرا المصرية، القاهرة
        </li>
        <li className={eventRowClassName}>٩ مايو · مسرح المجاز، الشارقة</li>
      </ul>
    ),
  },
  render: args => (
    <div dir='rtl' lang='ar'>
      <ProfileEventsCard {...args} />
    </div>
  ),
};
