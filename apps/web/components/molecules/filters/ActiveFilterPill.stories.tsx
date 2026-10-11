import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CircleDot } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActiveFilterPill } from './ActiveFilterPill';

const meta = {
  title: 'Molecules/Filters/ActiveFilterPill',
  component: ActiveFilterPill,
  parameters: {
    layout: 'centered',
  },
  args: {
    groupLabel: 'Status',
    values: ['Todo'],
    onClear: fn(),
  },
} satisfies Meta<typeof ActiveFilterPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const clearButton = within(canvasElement).getByRole('button', {
      name: 'Clear Status filter',
    });
    await userEvent.click(clearButton);
    await expect(args.onClear).toHaveBeenCalled();
  },
};

export const WithIcon: Story = {
  args: {
    icon: <CircleDot className='h-3.5 w-3.5' />,
  },
};

export const MultipleValues: Story = {
  args: {
    values: ['Todo', 'In Progress', 'Blocked'],
  },
};
