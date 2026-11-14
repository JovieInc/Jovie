import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ExportCSVButton } from './ExportCSVButton';

interface ExportRow {
  readonly name: string;
  readonly email: string;
  readonly city: string;
}

const rows: ExportRow[] = [
  { name: 'Jamie Rivera', email: 'jamie@example.com', city: 'Los Angeles' },
  { name: 'Alex Chen', email: 'alex@example.com', city: 'Toronto' },
];

/**
 * State coverage for the CSV export action. Each story changes only what
 * getData resolves to, the label or the document direction; the plays press
 * the button so the preparing, failure and confirmation states are visible.
 */
const meta = {
  title: 'Organisms/Table/Molecules/ExportCSVButton States',
  component: ExportCSVButton<ExportRow>,
  parameters: {
    layout: 'centered',
  },
  args: {
    getData: (): ExportRow[] | Promise<ExportRow[]> => rows,
    filename: 'audience-export',
  },
} satisfies Meta<typeof ExportCSVButton<ExportRow>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: data that never arrives keeps the button busy. */
export const LoadingPreparing: Story = {
  args: {
    getData: () => new Promise<ExportRow[]>(() => undefined),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    const busy = await canvas.findByRole('button', { busy: true });
    await expect(busy).toBeDisabled();
    await expect(busy).toHaveTextContent('Exporting...');
  },
};

/** Empty: no rows to export, so no confirmation opens. */
export const EmptyNoRows: Story = {
  args: {
    getData: () => [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(await canvas.findByRole('button')).toBeEnabled();
    await expect(within(document.body).queryByRole('alertdialog')).toBeNull();
  },
};

/** Error: preparing the export fails and the button recovers. */
export const ErrorPreparing: Story = {
  args: {
    getData: () => Promise.reject(new Error('Audience service unavailable')),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(await canvas.findByRole('button')).toBeEnabled();
  },
};

/** Offline: a network failure while fetching rows is handled like an error. */
export const OfflineFetchFailed: Story = {
  args: {
    getData: () => Promise.reject(new TypeError('Failed to fetch')),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(await canvas.findByRole('button')).toBeEnabled();
  },
};

/** Partial: no column config, so every row key becomes a column. */
export const PartialInferredColumns: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    const dialog = await within(document.body).findByRole('alertdialog');
    await expect(within(dialog).getByText('3')).toBeVisible();
  },
};

/** Long content: a long custom label in a narrow toolbar slot. */
export const LongContentLabel: Story = {
  args: {
    label: 'Export every subscriber with consent and location details',
  },
  decorators: [
    function NarrowSlot(Story) {
      return (
        <div className='w-64'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: an Arabic label inside an RTL document. */
export const RtlLabel: Story = {
  args: {
    label: 'تصدير CSV',
    ariaLabel: 'تصدير البيانات إلى ملف CSV',
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
