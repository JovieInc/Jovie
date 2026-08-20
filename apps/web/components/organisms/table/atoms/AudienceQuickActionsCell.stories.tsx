import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

const meta: Meta<typeof AudienceQuickActionsCell> = {
  title: 'Organisms/Table/AudienceQuickActionsCell',
  component: AudienceQuickActionsCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    onExport: () => undefined,
    onBlock: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof AudienceQuickActionsCell>;

export const Default: Story = {};
