import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NewFeaturesSection } from './NewFeaturesSection';

const meta = {
  title: 'Marketing/NewFeaturesSection',
  component: NewFeaturesSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof NewFeaturesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
