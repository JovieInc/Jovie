import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomePageNarrative } from './HomePageNarrative';

const meta = {
  title: 'Marketing/Sections/HomePageNarrative',
  component: HomePageNarrative,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    proofAvailability: 'hidden',
  },
} satisfies Meta<typeof HomePageNarrative>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
