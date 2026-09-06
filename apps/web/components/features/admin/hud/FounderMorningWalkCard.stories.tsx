import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FounderMorningWalkCard } from './FounderMorningWalkCard';

const meta = {
  title: 'Features/Admin/Hud/FounderMorningWalkCard',
  component: FounderMorningWalkCard,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof FounderMorningWalkCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultStatus: 'No walk recorded yet',
  },
};
