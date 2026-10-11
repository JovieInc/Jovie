import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageV2Route } from './HomepageV2Route';

const meta = {
  title: 'Marketing/Homepage V2/HomepageV2Route',
  component: HomepageV2Route,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full System B homepage-v2 route: hero, trust strip, system overview, spotlight, capture/reactivation, power grid, social proof, pricing, and final CTA.',
      },
    },
  },
} satisfies Meta<typeof HomepageV2Route>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Route: Story = {};
