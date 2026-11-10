import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UtmLinksLanding } from './UtmLinksLanding';

const meta = {
  title: 'Marketing/Product/UtmLinksLanding',
  component: UtmLinksLanding,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full /product/utm-links landing page composition: headline, support copy, the real UTM builder from the profile editor, and links.',
      },
    },
  },
} satisfies Meta<typeof UtmLinksLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {};
