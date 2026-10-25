import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SocialAuthButton } from './SocialAuthButton';

const meta = {
  title: 'Atoms/SocialAuthButton',
  component: SocialAuthButton,
  parameters: { layout: 'padded' },
  args: { provider: 'apple', disabled: false, onClick: fn() },
} satisfies Meta<typeof SocialAuthButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Apple: Story = {};
export const Google: Story = { args: { provider: 'google' } };
export const Pending: Story = { args: { pending: true } };
export const Disabled: Story = { args: { disabled: true } };
