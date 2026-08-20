import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceEngagementCell } from './AudienceEngagementCell';

const meta = {
  title: 'Organisms/Table/AudienceEngagementCell',
  component: AudienceEngagementCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    visits: 12,
    intentLevel: 'high',
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof AudienceEngagementCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighIntent: Story = {};

export const MediumIntent: Story = {
  args: {
    visits: 5,
    intentLevel: 'medium',
  },
};

export const LowIntent: Story = {
  args: {
    visits: 1,
    intentLevel: 'low',
  },
};
