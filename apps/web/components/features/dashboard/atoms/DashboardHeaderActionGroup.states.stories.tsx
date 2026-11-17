import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardHeaderActionGroup } from './DashboardHeaderActionGroup';

/**
 * State coverage for the dashboard header action group. The group only lays
 * out caller-owned leading and trailing actions, so each state changes those
 * slots or the document direction.
 */
const meta = {
  title: 'Features/Dashboard/Atoms/DashboardHeaderActionGroup States',
  component: DashboardHeaderActionGroup,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-120 max-w-full'>
      <DashboardHeaderActionGroup {...args} />
    </div>
  ),
} satisfies Meta<typeof DashboardHeaderActionGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no leading or trailing actions renders only the empty toolbar row. */
export const EmptyNoActions: Story = {};

/** Partial: trailing actions only, with no leading group. */
export const PartialTrailingOnly: Story = {
  args: {
    trailing: (
      <Button size='sm' variant='secondary'>
        Export
      </Button>
    ),
  },
};

/** Long content: more actions than fit scroll sideways instead of wrapping. */
export const LongContentManyActions: Story = {
  args: {
    children: (
      <>
        {[
          'Filter by platform',
          'Sort by most recent',
          'Group by release',
          'Show archived',
          'Columns',
        ].map(label => (
          <Button key={label} size='sm' variant='ghost'>
            {label}
          </Button>
        ))}
      </>
    ),
    trailing: (
      <Button size='sm' variant='primary'>
        Add a new smart link for this release
      </Button>
    ),
  },
};

/** Right-to-left: leading and trailing groups inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    children: (
      <Button size='sm' variant='ghost'>
        تصفية
      </Button>
    ),
    trailing: (
      <Button size='sm' variant='secondary'>
        تصدير
      </Button>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
