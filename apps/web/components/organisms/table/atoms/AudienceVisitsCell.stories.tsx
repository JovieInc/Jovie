import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceVisitsCell } from './AudienceVisitsCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceVisitsCell',
  component: AudienceVisitsCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    visits: 6,
    intentLevel: 'medium',
  },
} satisfies Meta<typeof AudienceVisitsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HighIntent: Story = {
  args: {
    visits: 24,
    intentLevel: 'high',
  },
};

export const LowIntent: Story = {
  args: {
    visits: 1,
    intentLevel: 'low',
  },
};
