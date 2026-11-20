import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ImageryStage } from './ImageryStage';

/** The one renderer for marketing art; the frame around it owns the radius. */
const meta = {
  title: 'Marketing/ImageryStage',
  component: ImageryStage,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ImageryStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReleaseCover: Story = {
  args: {
    src: '/img/releases/tomorrow-sounds.jpg',
    alt: 'Tomorrow Sounds cover art',
    width: 276,
    height: 276,
  },
};
