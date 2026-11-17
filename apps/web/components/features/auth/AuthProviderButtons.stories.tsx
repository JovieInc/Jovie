import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AuthProviderButtonSlot,
  AuthProviderButtonSlots,
} from './AuthProviderButtons';

const meta = {
  title: 'Auth/AuthProviderButtonSlot',
  component: AuthProviderButtonSlot,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AuthProviderButtonSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Google: Story = {
  args: {
    provider: 'google',
    disabled: false,
  },
};

export const AppleDisabled: Story = {
  args: {
    provider: 'apple',
    disabled: true,
  },
};

/** The provider the visitor pressed while its OAuth start is in flight. */
export const LoadingPending: Story = {
  args: {
    provider: 'google',
    disabled: false,
    pending: true,
  },
};

/** The hydration slots: both providers disabled inside a busy group. */
export const LoadingSlots: Story = {
  args: { provider: 'google' },
  render: () => (
    <div className='w-80'>
      <AuthProviderButtonSlots providers={['google', 'apple']} />
    </div>
  ),
};

/** Both provider pills inside a right-to-left page. */
export const Rtl: Story = {
  args: { provider: 'google', disabled: false },
  render: args => (
    <div dir='rtl' lang='ar' className='grid w-80 gap-1'>
      <AuthProviderButtonSlot {...args} provider='google' />
      <AuthProviderButtonSlot {...args} provider='apple' />
    </div>
  ),
};
