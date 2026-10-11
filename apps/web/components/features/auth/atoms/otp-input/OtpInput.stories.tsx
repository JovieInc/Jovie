import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OtpInput } from './OtpInput';

const meta = {
  title: 'Features/Auth/OtpInput',
  component: OtpInput,
  parameters: {
    layout: 'centered',
  },
  args: {
    autoFocus: false,
    'aria-label': 'One-time password',
  },
} satisfies Meta<typeof OtpInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const PartiallyFilled: Story = {
  args: {
    value: '123',
  },
};

export const ErrorState: Story = {
  args: {
    value: '000000',
    error: true,
  },
};
