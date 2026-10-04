import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CustomerRecoveryPanel } from './CustomerRecoveryPanel';
import { recoveryResult } from './fixtures';

const meta = {
  title: 'Features/Admin/CustomerRecovery/CustomerRecoveryPanel',
  component: CustomerRecoveryPanel,
  parameters: { layout: 'fullscreen' },
  args: { result: recoveryResult },
} satisfies Meta<typeof CustomerRecoveryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dossier: Story = {};
