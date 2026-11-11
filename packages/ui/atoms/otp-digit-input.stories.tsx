import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { OtpDigitInput } from './otp-digit-input';

// The atom draws no surface; a plain token box stands in for the segmented
// digit box that composes it in the app.
function DigitBox({ children }: { readonly children: ReactNode }) {
  return (
    <div className='relative flex h-12 w-11 items-center justify-center rounded-2xl border border-subtle bg-surface-1 text-primary-token'>
      {children}
    </div>
  );
}

const meta = {
  title: 'UI/Atoms/OtpDigitInput',
  component: OtpDigitInput,
  parameters: { layout: 'centered' },
  args: { 'aria-label': 'Digit 1 of 6', className: 'text-xl' },
  render: args => (
    <DigitBox>
      <OtpDigitInput {...args} />
    </DigitBox>
  ),
} satisfies Meta<typeof OtpDigitInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = {
  args: { value: '4', readOnly: true },
};

export const ErrorInvalid: Story = {
  args: { value: '9', readOnly: true, 'aria-invalid': true },
};

export const Disabled: Story = {
  args: { value: '2', disabled: true },
};

export const AutofillOverlay: Story = {
  args: { variant: 'autofill', 'aria-label': 'Autofill code' },
  render: args => (
    <div className='relative flex gap-2'>
      <OtpDigitInput {...args} />
      <DigitBox>1</DigitBox>
      <DigitBox>2</DigitBox>
    </div>
  ),
};

export const RtlRow: Story = {
  render: args => (
    <fieldset dir='rtl' className='flex gap-2 border-0 p-0'>
      <legend className='sr-only'>رمز التحقق</legend>
      <DigitBox>
        <OtpDigitInput {...args} value='1' readOnly />
      </DigitBox>
      <DigitBox>
        <OtpDigitInput {...args} aria-label='Digit 2 of 6' />
      </DigitBox>
    </fieldset>
  ),
};
