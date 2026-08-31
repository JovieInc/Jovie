import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PricingSection } from './PricingSection';

const meta = {
  title: 'Marketing/Sections/PricingSection',
  component: PricingSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PricingSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
