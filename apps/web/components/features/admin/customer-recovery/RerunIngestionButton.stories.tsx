import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RerunIngestionButton } from './RerunIngestionButton';

const meta = {
  title: 'Features/Admin/CustomerRecovery/RerunIngestionButton',
  component: RerunIngestionButton,
  parameters: { layout: 'centered' },
  args: { creatorProfileId: 'cp-1' },
} satisfies Meta<typeof RerunIngestionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
