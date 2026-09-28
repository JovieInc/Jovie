import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InstantlyPixel } from './InstantlyPixel';

const meta = {
  title: 'Tracking/InstantlyPixel',
  component: InstantlyPixel,
  parameters: {
    docs: {
      description: {
        component:
          'Consent- and route-gated Instantly retargeting adapter for public marketing surfaces. Always renders null; the bounded runtime state is exposed via <html data-instantly-runtime="...">. Gating behavior is covered by component tests.',
      },
    },
  },
} satisfies Meta<typeof InstantlyPixel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mounted: Story = {};
