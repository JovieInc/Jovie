import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardFeedbackModal } from './DashboardFeedbackModal';

const meta = {
  title: 'Dashboard/Organisms/DashboardFeedbackModal',
  component: DashboardFeedbackModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    isOpen: true,
    onClose: () => {},
    onSubmit: async () => {},
  },
} satisfies Meta<typeof DashboardFeedbackModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
