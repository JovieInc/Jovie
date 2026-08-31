import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardPay } from './DashboardPay';

const meta = {
  title: 'Features/Dashboard/DashboardPay/DashboardPay',
  component: DashboardPay,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'label',
        'value',
        'description',
        'icon',
        'venmoHandle',
        'onEdit',
        'onDisconnect',
        'onVenmoHandleChange',
        'onSave',
        'onCancel',
        'isSaving',
        'open',
        'onClose',
        'saveSuccess',
        'tipUrl',
        'tipRelativePathLink',
      ],
    },
  },
} satisfies Meta<typeof DashboardPay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
