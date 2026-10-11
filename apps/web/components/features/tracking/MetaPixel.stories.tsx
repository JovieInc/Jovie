import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MetaPixel } from './MetaPixel';

const meta = {
  title: 'Tracking/MetaPixel',
  component: MetaPixel,
  parameters: {
    docs: {
      description: {
        component:
          'Consent-gated Meta (Facebook) browser pixel for public surfaces. The story certifies its mounted, idle state; init/PageView behavior is covered by component tests.',
      },
    },
  },
} satisfies Meta<typeof MetaPixel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mounted: Story = {
  args: { pixelIds: ['0000000000000001'] },
};
