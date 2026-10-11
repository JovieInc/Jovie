import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
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

export const Requested: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Re-run Artist Ingestion' })
    );
    await expect(
      await canvas.findByText(/Recovery requested/)
    ).toBeInTheDocument();
  },
};
