import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeProfileShowcase } from './HomeProfileShowcase';

const meta = {
  title: 'Features/Home/HomeProfileShowcase',
  component: HomeProfileShowcase,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HomeProfileShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

// Real homepage preview state (apps/web/components/features/home/homepage-profile-preview-fixture.ts).
export const MockHome: Story = {
  args: {
    stateId: 'mock-home',
  },
};

export const StreamsLatest: Story = {
  args: {
    stateId: 'streams-latest',
  },
};
