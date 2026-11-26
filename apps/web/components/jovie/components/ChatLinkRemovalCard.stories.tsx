import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { ChatLinkRemovalCard } from './ChatLinkRemovalCard';

const meta = {
  title: 'Jovie/Components/ChatLinkRemovalCard',
  component: ChatLinkRemovalCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof ChatLinkRemovalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: {
    profileId: 'profile-story',
    linkId: 'link-story',
    platform: 'Spotify',
    url: 'https://open.spotify.com/artist/story-artist',
  },
};

export const Dismissed: Story = {
  args: {
    profileId: 'profile-story',
    linkId: 'link-story',
    platform: 'Spotify',
    url: 'https://open.spotify.com/artist/story-artist',
  },
};

/** Error: removing the link fails in Storybook (no API), so the card shows its retry message. */
export const ErrorRemovalFails: Story = {
  args: Pending.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', { name: 'Remove' })
    );
  },
};

/** Long content: a very long URL stays on one truncated line. */
export const LongContentUrl: Story = {
  args: {
    ...Pending.args,
    platform: 'Spotify',
    url: 'https://open.spotify.com/artist/story-artist/with/a/very/long/path/that/keeps/going/and/going/past/the/card/width?utm_source=story&utm_medium=chat',
  },
};

/** Rtl: right-to-left platform label and url. */
export const RtlLabel: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    ...Pending.args,
    platform: 'سبوتيفاي',
    url: 'https://open.spotify.com/artist/story-artist',
  },
};
