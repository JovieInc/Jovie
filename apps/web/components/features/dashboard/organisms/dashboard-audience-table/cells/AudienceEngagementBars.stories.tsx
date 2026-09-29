import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceEngagementBars } from './AudienceEngagementBars';

const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/Cells/AudienceEngagementBars',
  component: AudienceEngagementBars,
  parameters: {
    layout: 'centered',
  },
  args: {
    score: 60,
  },
  argTypes: {
    score: {
      control: { type: 'range', min: 0, max: 100, step: 5 },
    },
  },
} satisfies Meta<typeof AudienceEngagementBars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};

export const Zero: Story = {
  args: { score: 0 },
};

export const Full: Story = {
  args: { score: 100 },
};

export const AllLevels: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {[0, 20, 40, 60, 80, 100].map(score => (
        <AudienceEngagementBars key={score} score={score} />
      ))}
    </div>
  ),
};
