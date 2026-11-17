import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FormError } from './FormError';

const meta = {
  title: 'Features/Auth/FormError',
  component: FormError,
  parameters: {
    layout: 'centered',
  },
  args: {
    message: 'That email address is already in use.',
  },
} satisfies Meta<typeof FormError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoMessage: Story = {
  args: {
    message: null,
  },
};

export const ErrorCodeExpired: Story = {
  args: {
    id: 'auth-email-code-error',
    message: 'That code has expired. Request a new one to continue.',
  },
};

export const LongContent: Story = {
  args: {
    message:
      'We could not send a sign-in code to that address. Check that the email is spelled correctly, that your inbox is not full, and that messages from jov.ie are not blocked, then try again.',
  },
  render: args => (
    <div className='w-80'>
      <FormError {...args} />
    </div>
  ),
};

export const Rtl: Story = {
  args: {
    message:
      'انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا وأدخله خلال عشر دقائق للمتابعة.',
  },
  render: args => (
    <div dir='rtl' className='w-80'>
      <FormError {...args} />
    </div>
  ),
};
