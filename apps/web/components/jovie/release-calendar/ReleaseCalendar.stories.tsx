import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import {
  type DemoMoment,
  generateDemoPlan,
} from '@/lib/release-planning/demo-plan';
import { ReleaseCalendar } from './ReleaseCalendar';

function StatefulReleaseCalendar() {
  const [plan, setPlan] = useState<DemoMoment[]>(() => generateDemoPlan());

  return (
    <ReleaseCalendar plan={plan} onPlanChange={setPlan} onMomentClick={fn()} />
  );
}

const meta = {
  title: 'Features/Releases/ReleaseCalendar',
  component: ReleaseCalendar,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    plan: generateDemoPlan(),
    onPlanChange: fn(),
    onMomentClick: fn(),
  },
  decorators: [
    Story => (
      <div className='min-h-96 bg-surface-page p-3 sm:p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReleaseCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullPlan: Story = {};

export const Interactive: Story = {
  render: () => <StatefulReleaseCalendar />,
};

export const Narrow: Story = {
  render: args => (
    <div className='w-90 max-w-full'>
      <ReleaseCalendar {...args} />
    </div>
  ),
};
