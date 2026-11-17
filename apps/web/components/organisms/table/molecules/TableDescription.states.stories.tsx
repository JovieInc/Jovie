import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { TableDescription } from './TableDescription';

const LONG_TEXT =
  'Usage includes application hosting, image processing, scheduled jobs, preview deployments for every branch, log drains to two providers and a nightly export of analytics events. This note keeps going past the two-line preview so the full text is only reachable through the disclosure, and the row height never changes when it is read.';

/** State coverage for the bounded table description preview. */
const meta = {
  title: 'Organisms/Table/TableDescription States',
  component: TableDescription,
  args: {
    label: 'Hosting notes',
    text: LONG_TEXT,
  },
} satisfies Meta<typeof TableDescription>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: the preview clamps and the full text opens in a popover. */
export const LongContentDisclosure: Story = {
  decorators: [
    function CellWidth(Story) {
      return (
        <div className='w-64'>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', {
        name: 'Read full Hosting notes',
      })
    );
    const dialog = await within(document.body).findByRole('dialog', {
      name: 'Hosting notes',
    });
    await expect(dialog).toHaveTextContent(LONG_TEXT);
  },
};

/** Right-to-left: Arabic notes inside an RTL document. */
export const RtlDescription: Story = {
  args: {
    label: 'ملاحظات الاستضافة',
    text: 'يشمل الاستخدام استضافة التطبيق ومعالجة الصور والمهام المجدولة.',
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' className='w-64'>
          <Story />
        </div>
      );
    },
  ],
};
