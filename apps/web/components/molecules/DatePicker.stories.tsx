import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DatePicker } from './DatePicker';

const meta = {
  title: 'Molecules/DatePicker',
  component: DatePicker,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-64 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    value: '',
    onChange: fn(),
  },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithValue: Story = {
  args: {
    value: '2030-05-20',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    value: '2030-05-20',
  },
};
