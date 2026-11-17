import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import type { LyricsListLine } from './LyricsList';
import { LyricsList } from './LyricsList';

const drawer: Decorator = function DrawerColumn(Story) {
  return (
    <div className='w-80 bg-base'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 bg-base'>
      <Story />
    </div>
  );
};

const LONG_LINES: LyricsListLine[] = Array.from({ length: 40 }, (_, i) => ({
  at: i * 7,
  text: `Line ${i + 1}: driving through the midnight glow while the city lights keep calling me back home again`,
}));

/** State coverage for the drawer lyrics list; Default, WithEdit, ReadOnly and Empty live in LyricsList.stories.tsx. */
const meta = {
  title: 'Shell/LyricsList States',
  component: LyricsList,
  parameters: { layout: 'centered' },
  decorators: [drawer],
  args: {
    lines: [
      { at: 0, text: 'Driving through the midnight glow' },
      { at: 12, text: "City lights, I don't wanna go" },
    ],
    onSeek: fn(),
  },
} satisfies Meta<typeof LyricsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: lines with no seek or edit handler render as disabled rows. */
export const PartialReadOnly: Story = {
  args: { onSeek: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const row of canvas.getAllByRole('button'))
      await expect(row).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: 'Edit' })).toBeNull();
  },
};

/** Long content: forty wrapping lines with minute-scale timestamps. */
export const LongContentFortyLines: Story = {
  args: { lines: LONG_LINES, onEdit: fn() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('4:33')).toBeInTheDocument();
  },
};

/** Right-to-left: Arabic lines and a custom title in an RTL drawer. */
export const RtlArabic: Story = {
  args: {
    title: 'كلمات الأغنية',
    editLabel: 'تعديل',
    onEdit: fn(),
    lines: [
      { at: 0, text: 'أقود في وهج منتصف الليل' },
      { at: 12, text: 'أضواء المدينة لا أريد الرحيل' },
    ],
  },
  decorators: [rtl],
};
