import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseTaskCategoryGroup } from './ReleaseTaskCategoryGroup';

const meta = {
  title: 'Dashboard/ReleaseTasks/ReleaseTaskCategoryGroup',
  component: ReleaseTaskCategoryGroup,
  parameters: {
    layout: 'padded',
  },
  render: args => (
    <div className='w-96 rounded-lg border border-subtle'>
      <ReleaseTaskCategoryGroup {...args} />
    </div>
  ),
  args: {
    category: 'Marketing',
    done: 2,
    total: 5,
    children: (
      <div className='space-y-1 px-4 py-2 text-app text-secondary-token'>
        <p>Pitch playlist editors</p>
        <p>Notify core fans</p>
      </div>
    ),
  },
} satisfies Meta<typeof ReleaseTaskCategoryGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    defaultOpen: true,
  },
};

export const Collapsed: Story = {
  args: {
    defaultOpen: false,
  },
};

export const AllDone: Story = {
  args: {
    done: 5,
    total: 5,
    allDone: true,
    defaultOpen: true,
  },
};
