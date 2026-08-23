import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseSidebar } from './ReleaseSidebar';

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSidebar',
  component: ReleaseSidebar,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['disabled', 'isLoading'] },
  },
} satisfies Meta<typeof ReleaseSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    release: null,
    mode: 'view',
    isOpen: true,
    providerConfig: {},
  },
};
