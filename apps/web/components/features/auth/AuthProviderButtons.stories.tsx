import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthProviderButtonSlot } from './AuthProviderButtons';

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
