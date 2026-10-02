import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { IngestProfileDropdown } from './IngestProfileDropdown';

const meta = {
  title: 'Features/Admin/IngestProfileDropdown',
  component: IngestProfileDropdown,
  parameters: {
    layout: 'centered',
  },
  args: {
    onIngestPending: fn(),
    hideLabelOnMobile: false,
  },
} satisfies Meta<typeof IngestProfileDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Ingest Profile' })
    );
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText('Ingest social profile')
    ).toBeInTheDocument();
  },
};

export const CompactLabel: Story = {
  args: {
    hideLabelOnMobile: true,
  },
};
