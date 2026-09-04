import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeAdaptiveProfileStory } from './HomeAdaptiveProfileStory';

const meta = {
  title: 'Marketing/Sections/HomeAdaptiveProfileStory',
  component: HomeAdaptiveProfileStory,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeAdaptiveProfileStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
