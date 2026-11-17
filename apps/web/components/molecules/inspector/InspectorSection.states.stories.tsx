import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { InspectorEmpty } from './InspectorEmpty';
import { InspectorRow } from './InspectorRow';
import { InspectorSection } from './InspectorSection';

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

const FACTS = Array.from({ length: 24 }, (_, index) => ({
  label: `Credit ${index + 1}`,
  value: `Additional production, mixing and mastering contributor number ${index + 1}`,
}));

/** State coverage for the inspector section; Default lives in InspectorSection.stories.tsx. */
const meta = {
  title: 'Molecules/Inspector/InspectorSection States',
  component: InspectorSection,
  decorators: [column],
  args: {
    title: 'Assets',
    children: <InspectorEmpty message='No assets for this object.' />,
  },
} satisfies Meta<typeof InspectorSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a section with no title renders only its body. */
export const PartialUntitled: Story = {
  args: {
    title: undefined,
    children: <InspectorRow label='ISRC' value='USRC17607839' />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Assets')).not.toBeInTheDocument();
    await expect(canvas.getByText('USRC17607839')).toBeVisible();
  },
};

/** Long content: a long title over two dozen wrapping credit rows. */
export const LongContentManyFacts: Story = {
  args: {
    title: 'Credits, splits and every contributor on this recording',
    children: (
      <>
        {FACTS.map(fact => (
          <InspectorRow
            key={fact.label}
            label={fact.label}
            value={fact.value}
            align='start'
          />
        ))}
      </>
    ),
  },
};

/** Right-to-left: an Arabic section in an RTL inspector. */
export const RtlArabic: Story = {
  args: {
    title: 'الأصول',
    children: <InspectorRow label='الحالة' value='تم الإصدار' />,
  },
  decorators: [rtl],
};
