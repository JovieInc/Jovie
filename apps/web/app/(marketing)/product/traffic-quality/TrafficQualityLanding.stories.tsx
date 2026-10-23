import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TrafficQualityLanding } from './TrafficQualityLanding';

const meta = {
  title: 'Marketing/Product/TrafficQualityLanding',
  component: TrafficQualityLanding,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full /product/traffic-quality landing page composition: headline, support copy, and the traffic-quality filter workflow over release analytics.',
      },
    },
  },
} satisfies Meta<typeof TrafficQualityLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {};
