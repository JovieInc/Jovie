import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AddProviderUrlPopover } from './AddProviderUrlPopover';

const meta = {
  title:
    'Features/Dashboard/Organisms/Releases/Components/AddProviderUrlPopover',
  component: AddProviderUrlPopover,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['providerLabel', 'accent', 'onSave'],
    },
  },
} satisfies Meta<typeof AddProviderUrlPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
