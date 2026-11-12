import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES } from '@/components/features/home/homepage-profile-preview-fixture';
import { PublicProfileFixture } from './PublicProfileFixture';

const meta: Meta<typeof PublicProfileFixture> = {
  title: 'Profile/PublicProfileFixture',
  component: PublicProfileFixture,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof PublicProfileFixture>;

export const Unclaimed: Story = {
  args: { state: 'unclaimed' },
};

export const LongName: Story = {
  args: { longName: true, state: 'unclaimed' },
};

export const Claimed: Story = {
  args: { state: 'claimed' },
};

/** No upcoming tour dates: the events destination shows its empty copy. */
export const EmptyTourDates: Story = {
  args: { state: 'unclaimed', tourDates: [] },
};

/** A single upcoming date, the sparsest populated events list. */
export const SparseOneTourDate: Story = {
  args: {
    state: 'unclaimed',
    tourDates: HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES.slice(0, 1),
  },
};

/** The fixture profile inside a right-to-left page. */
export const Rtl: Story = {
  args: { displayName: 'أنفيزد', state: 'claimed' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
