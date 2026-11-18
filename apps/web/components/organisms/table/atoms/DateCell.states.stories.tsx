import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { DateCell } from './DateCell';

/** State coverage for the formatted date cell. */
const meta = {
  title: 'Organisms/Table/Atoms/DateCell States',
  component: DateCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    date: new Date('2026-09-01T12:00:00.000Z'),
  },
} satisfies Meta<typeof DateCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only a locale is passed, so both formats keep their defaults. */
export const PartialLocaleOnly: Story = {
  args: {
    locale: 'de-DE',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('1. Sept. 2026')
    ).toBeVisible();
  },
};

/** Long content: a weekday, month name and time stay on one line. */
export const LongContentFormat: Story = {
  args: {
    formatOptions: {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    },
  },
};

/** Right-to-left: an Arabic-locale date inside an RTL document. */
export const RtlArabicLocale: Story = {
  args: {
    locale: 'ar-EG',
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
