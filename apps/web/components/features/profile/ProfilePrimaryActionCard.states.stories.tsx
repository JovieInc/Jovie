import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfilePrimaryActionCard } from './ProfilePrimaryActionCard';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

/** Rendered states of the profile primary action card. */
const meta = {
  title: 'Profile/ProfilePrimaryActionCard/States',
  component: ProfilePrimaryActionCard,
  parameters: { layout: 'centered' },
  args: {
    artist: PROFILE_STORY_ARTIST,
    hasPlayableDestinations: true,
    tourDates: [],
  },
} satisfies Meta<typeof ProfilePrimaryActionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no release, tour date or playable destination, so nothing renders. */
export const EmptyNoAction: Story = {
  args: { hasPlayableDestinations: false },
};

/** Partial: an artist without a photo falls back to the play glyph. */
export const PartialNoArtistImage: Story = {
  args: { artist: { ...PROFILE_STORY_ARTIST, image_url: null } },
};

/** Long content: an artist name that must truncate inside the card. */
export const LongContentArtistName: Story = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      name: 'Tim White and The Very Long Named Late Night Orchestra of Los Angeles',
    },
  },
};

function RtlDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl' className='w-80'>
      <Story />
    </div>
  );
}

/** Rtl: the card mirrors with its action pill on the leading side. */
export const RtlListenCard: Story = {
  decorators: [RtlDecorator],
};
