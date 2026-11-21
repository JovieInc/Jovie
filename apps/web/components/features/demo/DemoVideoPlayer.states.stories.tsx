import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoVideoPlayer } from './DemoVideoPlayer';

/**
 * State coverage for the demo video player. The canonical story lives in
 * DemoVideoPlayer.stories.tsx; these change the video source or direction.
 */
const meta = {
  title: 'Features/Demo/DemoVideoPlayer States',
  component: DemoVideoPlayer,
  parameters: {
    layout: 'centered',
  },
  args: {
    videoUrl: '/demo/jovie-demo.mp4',
  },
} satisfies Meta<typeof DemoVideoPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: no video is configured, so the screenshot carousel stands in. */
export const ErrorNoVideoUrl: Story = {
  args: { videoUrl: undefined },
};

/** Partial: a video without a poster frame shows the play button over black. */
export const PartialWithoutPoster: Story = {
  args: { posterUrl: undefined },
};

function RtlDocumentDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

/** Right-to-left: the player inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [RtlDocumentDecorator],
};
