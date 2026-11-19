import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileAboutShare } from './ProfileAboutShare';

/** The share control in the profile About and answer-engine content block. */
const AeoContentFrame: Decorator = function AeoContentFrame(Story) {
  return (
    <div className='profile-aeo-content bg-base p-6'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Profile/ProfileAboutShare',
  component: ProfileAboutShare,
  parameters: { layout: 'centered' },
  args: {
    url: 'https://jov.ie/timwhite',
    artistName: 'Tim White',
  },
  decorators: [AeoContentFrame],
} satisfies Meta<typeof ProfileAboutShare>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Long content: a long artist name only changes the control's label. */
export const LongContentArtistName: Story = {
  args: {
    artistName:
      'The Midnight Collective Orchestra and Friends Featuring Special Guests',
    url: 'https://jov.ie/the-midnight-collective-orchestra-and-friends',
  },
};

/** Right-to-left: an Arabic artist name in an Arabic document direction. */
export const RtlArabicArtist: Story = {
  args: { artistName: 'فرقة منتصف الليل' },
  decorators: [RtlFrame],
};
