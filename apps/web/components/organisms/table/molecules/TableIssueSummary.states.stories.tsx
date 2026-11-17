import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { TableIssueSummary } from './TableIssueSummary';

/** State coverage for the row issue summary and its popover list. */
const meta = {
  title: 'Organisms/Table/TableIssueSummary States',
  component: TableIssueSummary,
  args: {
    issues: [{ label: 'No artwork' }],
  },
} satisfies Meta<typeof TableIssueSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Error: one blocking issue, opened to show it in the error tone. */
export const ErrorSingleIssue: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'View 1 issue' })
    );
    const dialog = await within(document.body).findByRole('dialog', {
      name: 'Issues',
    });
    await expect(within(dialog).getByText('No artwork')).toBeVisible();
  },
};

/** Long content: many issues with long labels stay behind one count. */
export const LongContentManyIssues: Story = {
  args: {
    issues: [
      { label: 'No artwork uploaded for the primary release' },
      { label: 'No distribution providers selected for this territory' },
      { label: 'No UPC assigned by the label or the distributor' },
      { label: '0 tracks attached to the release' },
      { label: 'Release date is before the earliest allowed delivery date' },
      { label: 'Explicit content flag is missing on two tracks' },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'View 6 issues' })
    ).toBeVisible();
  },
};

/** Right-to-left: Arabic issue labels inside an RTL document. */
export const RtlIssues: Story = {
  args: {
    issues: [{ label: 'لا يوجد غلاف' }, { label: 'لا يوجد موزعون' }],
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
