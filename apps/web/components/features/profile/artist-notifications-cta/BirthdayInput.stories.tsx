import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BirthdayInput } from './BirthdayInput';

const meta = {
  title: 'Features/Profile/BirthdayInput',
  component: BirthdayInput,
  parameters: {
    layout: 'centered',
  },
  args: {
    autoFocus: false,
  },
} satisfies Meta<typeof BirthdayInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const PartiallyFilled: Story = {
  args: {
    value: '0715',
  },
};

export const ErrorState: Story = {
  args: {
    value: '02301990',
    error: true,
  },
};
