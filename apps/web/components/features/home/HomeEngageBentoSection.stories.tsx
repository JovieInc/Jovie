import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeEngageBentoSection } from './HomeEngageBentoSection';

const meta = {
  title: 'Marketing/Sections/HomeEngageBentoSection',
  component: HomeEngageBentoSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeEngageBentoSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
