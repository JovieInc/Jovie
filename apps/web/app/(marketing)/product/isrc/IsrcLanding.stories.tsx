import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IsrcLanding } from './IsrcLanding';

const meta = {
  title: 'Marketing/Product/IsrcLanding',
  component: IsrcLanding,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full /product/isrc landing page composition: headline, support copy, and the real ISRC editor from the release workflow.',
      },
    },
  },
} satisfies Meta<typeof IsrcLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {};
