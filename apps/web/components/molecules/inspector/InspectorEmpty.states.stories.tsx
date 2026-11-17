import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { InspectorEmpty } from './InspectorEmpty';

const column: Decorator = function InspectorColumn(Story) {
  return (
    <div className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

/** State coverage for the inspector empty note; Default lives in InspectorEmpty.stories.tsx. */
const meta = {
  title: 'Molecules/Inspector/InspectorEmpty States',
  component: InspectorEmpty,
  decorators: [column],
  args: { message: 'No assets for this object.' },
} satisfies Meta<typeof InspectorEmpty>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a multi-sentence empty note wraps inside the inspector column. */
export const LongContentWrappedNote: Story = {
  args: {
    message:
      'No assets for this object yet. Upload cover art, a canvas loop, lyric files or stems and they will appear here with their sizes, formats and the date each one was last changed.',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('inspector-empty')
    ).toHaveTextContent('Upload cover art');
  },
};

/** Right-to-left: an Arabic empty note in an RTL inspector. */
export const RtlArabic: Story = {
  args: { message: 'لا توجد أصول لهذا العنصر.' },
  decorators: [rtl],
};
