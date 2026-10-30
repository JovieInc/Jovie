import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileModeSwitcher',
  component: ArtistProfileModeSwitcher,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='bg-surface-0 px-6 py-16 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    phoneCaption: 'Live artist profile',
    phoneSubcaption: 'Adaptive action path preview',
    showIntroHeading: true,
  },
} satisfies Meta<typeof ArtistProfileModeSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Intro: Story = {
  args: {
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    phoneCaption: 'Live artist profile',
    phoneSubcaption: 'Adaptive action path preview',
    showIntroHeading: true,
  },
};

export const Compact: Story = {
  args: {
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    phoneCaption: 'Profile preview',
    phoneSubcaption: 'Release, video, shows, and shop modes',
    showIntroHeading: false,
  },
};
