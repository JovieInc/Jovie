import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { stubYouTubeEmbeds } from '@/.storybook/youtube-embed-stub';
import { YouTubeEmbed } from './YouTubeEmbed';

const meta = {
  title: 'Features/Release/YouTubeEmbed',
  component: YouTubeEmbed,
  parameters: {
    layout: 'centered',
  },
  // Stories never load YouTube: the iframe gets a local placeholder document.
  beforeEach: () => stubYouTubeEmbeds(),
  decorators: [
    Story => (
      <div className='w-96'>
        <Story />
      </div>
    ),
  ],
  args: {
    videoId: 'dQw4w9WgXcQ',
    title: 'Music video preview',
  },
} satisfies Meta<typeof YouTubeEmbed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The embed has not fired load yet: the pulse skeleton covers the frame. */
export const LoadingSkeleton: Story = {
  beforeEach: () => stubYouTubeEmbeds({ holdLoad: true }),
};

/** The 16:9 frame inside a right-to-left page. */
export const Rtl: Story = {
  args: { title: 'معاينة الفيديو الموسيقي' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
