import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeatureShowcase } from './FeatureShowcase';

const meta = {
  title: 'Marketing/Sections/FeatureShowcase',
  component: FeatureShowcase,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof FeatureShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
