import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PricingPreview } from './PricingPreview';

const meta = {
  title: 'Marketing/PricingPreview',
  component: PricingPreview,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof PricingPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
