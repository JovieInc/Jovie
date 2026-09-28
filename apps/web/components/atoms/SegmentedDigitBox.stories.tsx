import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SegmentedDigitBox } from './SegmentedDigitBox';

const BOX_SIZE_CLASSNAME = 'h-12 w-11 sm:h-12 sm:w-12';
const TEXT_SIZE_CLASSNAME = 'text-[1.22rem] sm:text-[1.3rem]';

const meta = {
  title: 'Atoms/SegmentedDigitBox',
  component: SegmentedDigitBox,
  parameters: {
    layout: 'centered',
  },
  args: {
    digit: '',
    isFocused: false,
    index: 0,
    inputRef: fn(),
    onInputChange: fn(),
    onKeyDown: fn(),
    onInput: fn(),
    onFocus: fn(),
    onBlur: fn(),
    ariaLabel: 'Digit 1 of 6',
    boxSizeClassName: BOX_SIZE_CLASSNAME,
    textSizeClassName: TEXT_SIZE_CLASSNAME,
  },
} satisfies Meta<typeof SegmentedDigitBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Focused: Story = {
  args: {
    isFocused: true,
  },
};

export const Filled: Story = {
  args: {
    digit: '4',
  },
};

export const Error: Story = {
  args: {
    digit: '9',
    error: true,
  },
};

export const Disabled: Story = {
  args: {
    digit: '2',
    disabled: true,
  },
};

const OTP_SEQUENCE_SLOTS = [
  { slot: 'otp-slot-1', digit: '4' },
  { slot: 'otp-slot-2', digit: '2' },
  { slot: 'otp-slot-3', digit: '' },
  { slot: 'otp-slot-4', digit: '' },
  { slot: 'otp-slot-5', digit: '' },
  { slot: 'otp-slot-6', digit: '' },
] as const;

export const OtpSequence: Story = {
  name: 'Sequence (fieldset)',
  render: args => (
    <fieldset className='flex justify-center gap-2 border-0 p-0'>
      {OTP_SEQUENCE_SLOTS.map(({ slot, digit }, index) => (
        <SegmentedDigitBox
          {...args}
          key={slot}
          digit={digit}
          index={index}
          isFocused={index === 2}
          ariaLabel={`Digit ${index + 1} of 6`}
        />
      ))}
    </fieldset>
  ),
};
