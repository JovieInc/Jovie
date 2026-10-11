import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JoviePixel } from './JoviePixel';

const meta = {
  title: 'Tracking/JoviePixel',
  component: JoviePixel,
  parameters: {
    docs: {
      description: {
        component:
          'Renderless first-party event collector. The story certifies its mounted, idle state; interaction behavior is covered by component tests.',
      },
    },
  },
} satisfies Meta<typeof JoviePixel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mounted: Story = {
  args: { profileId: '00000000-0000-4000-8000-000000000001' },
};
