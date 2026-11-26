import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { waitFor, within } from 'storybook/test';
import { DemoVideoPlayer } from './DemoVideoPlayer';

const meta = {
  title: 'Features/Demo/DemoVideoPlayer',
  component: DemoVideoPlayer,
  parameters: { layout: 'padded' },
  args: {
    videoUrl: '/demo/jovie-demo.mp4',
    posterUrl: '/demo/jovie-demo-poster.jpg',
  },
} satisfies Meta<typeof DemoVideoPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: no video is configured, so the screenshot carousel stands in. */
export const EmptyNoVideoUrl: Story = {
  args: { videoUrl: undefined },
};

/** Error: the video fails to load, so the screenshot carousel takes over. */
export const ErrorVideoFailsToLoad: Story = {
  play: async ({ canvasElement }) => {
    const video = canvasElement.querySelector('video');
    video?.dispatchEvent(new Event('error'));
    await waitFor(() => {
      within(canvasElement).getByRole('button', { name: 'Next Slide' });
    });
  },
};

/** Partial: native controls and no poster, so no custom play button. */
export const PartialNativeControls: Story = {
  args: { posterUrl: undefined, controls: true },
};

/** Long content: a long accessible label for the video element. */
export const LongContentLabel: Story = {
  args: {
    label:
      'Jovie demo video: build an artist profile, ship a release page and track every fan from the first listen',
  },
};

function RtlDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** Rtl: the frame and the centered play button hold position. */
export const RtlPlayer: Story = {
  decorators: [RtlDecorator],
};
