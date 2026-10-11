import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FilterSearchInput } from './FilterSearchInput';

const meta = {
  title: 'Molecules/Filters/FilterSearchInput',
  component: FilterSearchInput,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-56'>
        <Story />
      </div>
    ),
  ],
  args: {
    value: '',
    onChange: fn(),
    onClear: fn(),
  },
} satisfies Meta<typeof FilterSearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole('textbox');
    await userEvent.type(input, 'a');
    await expect(args.onChange).toHaveBeenCalledWith('a');
  },
};

export const WithValue: Story = {
  args: {
    value: 'genre',
  },
  play: async ({ canvasElement, args }) => {
    const clearButton = within(canvasElement).getByRole('button', {
      name: 'Clear Search',
    });
    await userEvent.click(clearButton);
    await expect(args.onClear).toHaveBeenCalled();
  },
};

export const CustomPlaceholder: Story = {
  args: {
    placeholder: 'Filter genres...',
  },
};
