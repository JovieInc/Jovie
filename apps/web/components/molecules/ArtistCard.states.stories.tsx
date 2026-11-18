import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistCard } from './ArtistCard';

const AVATAR =
  'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952';

/** Rendered states of the artist card, beside ArtistCard.stories.tsx. */
const meta: Meta<typeof ArtistCard> = {
  title: 'Molecules/ArtistCard States',
  component: ArtistCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    handle: 'arianagrande',
    name: 'Ariana Grande',
    src: AVATAR,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no photo yet, so the avatar falls back to the artist initials. */
export const PartialNoPhoto: Story = {
  args: {
    src: '',
    isVerified: false,
  },
};

/** Long content: a long stage name under a small avatar in a narrow grid cell. */
export const LongContentName: Story = {
  args: {
    size: 'sm',
    isVerified: true,
    name: 'The Midnight Orchestra and the Late Night Chorus',
    handle: 'midnightorchestra',
  },
  decorators: [
    Story => (
      <div className='w-32'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an Arabic name on a right-to-left page. */
export const RtlArabicName: Story = {
  args: {
    name: 'فيروز',
    handle: 'fairuz',
    isVerified: true,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
