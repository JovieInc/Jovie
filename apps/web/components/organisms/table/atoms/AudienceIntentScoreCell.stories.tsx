import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceIntentScoreCell } from './AudienceIntentScoreCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceIntentScoreCell',
  component: AudienceIntentScoreCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    intentLevel: 'high',
  },
} satisfies Meta<typeof AudienceIntentScoreCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = {};

export const Medium: Story = {
  args: {
    intentLevel: 'medium',
  },
};

export const Low: Story = {
  args: {
    intentLevel: 'low',
  },
};
