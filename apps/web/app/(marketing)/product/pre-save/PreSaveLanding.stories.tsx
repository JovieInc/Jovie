import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PreSaveLanding } from './PreSaveLanding';

const meta = {
  title: 'Marketing/Product/PreSaveLanding',
  component: PreSaveLanding,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full /product/pre-save landing page composition: headline, support copy, and the real countdown from the unreleased release page.',
      },
    },
  },
} satisfies Meta<typeof PreSaveLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {};
