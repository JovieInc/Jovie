import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieConnectVerification } from '@/app/(auth)/ovie/connect/OvieConnectVerification';

const meta = {
  title: 'Auth/OvieConnectVerification',
  component: OvieConnectVerification,
  parameters: { layout: 'fullscreen' },
  args: {
    authorizePath:
      '/api/ovie/oauth/authorize?handoff=synthetic-storybook-request',
    purpose: 'admin',
  },
} satisfies Meta<typeof OvieConnectVerification>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Passkey: Story = {};
export const Privacy: Story = { args: { purpose: 'privacy' } };
