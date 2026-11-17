import '@/app/globals.css';
import type { ReactNode } from 'react';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOME_LOOP_FIXTURE_STRIP } from './fixtures';
import { HomeLoopStageStrip } from './HomeLoopStageStrip';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-96'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the stage-time strip. The canonical stories stay in
 * HomeLoopStageStrip.stories.tsx; these change the items and the direction.
 */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopStageStrip States',
  component: HomeLoopStageStrip,
  parameters: { layout: 'padded' },
  args: {
    title: 'Stage Time 7d (P50 / P95)',
    items: HOME_LOOP_FIXTURE_STRIP,
    coverage: '14 of 31 stages measured',
    emptyLabel: 'Not measured',
  },
} satisfies Meta<typeof HomeLoopStageStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no stage is measured yet, so the strip says so instead of looking fast. */
export const EmptyNotMeasured: Story = {
  args: { items: [], coverage: null },
};

/** Long content: more spans than two lines hold; the strip clips the rest. */
export const LongContentManySpans: Story = {
  args: {
    items: [
      ...HOME_LOOP_FIXTURE_STRIP,
      ...HOME_LOOP_FIXTURE_STRIP.map(item => ({
        ...item,
        id: `${item.id}-again`,
        label: `${item.label} (previous week)`,
      })),
    ],
  },
  decorators: [Frame],
};

/** Right-to-left: the strip inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    title: 'وقت المراحل',
    items: [{ id: 'rtl', label: 'الشحن', value: '38m / 28h', tone: 'warn' }],
  },
  decorators: [RtlFrame],
};
