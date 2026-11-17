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

// A full code in every density: the longest content each box row can hold.
export const LongContentFullCode: Story = {
  args: {
    value: '123456',
  },
  render: args => (
    <div className='flex flex-col items-center gap-8'>
      <OtpInput {...args} size='default' />
      <OtpInput {...args} size='compact' showProgressDots={false} />
    </div>
  ),
};

// The code itself stays left-to-right inside a right-to-left page.
export const Rtl: Story = {
  args: {
    value: '123',
    'aria-label': 'رمز التحقق',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
