import '@/app/globals.css';
import type { ReactNode } from 'react';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HOME_LOOP_FIXTURE_DONE,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
} from './fixtures';
import {
  HomeLoopDoneChips,
  HomeLoopStageRows,
  HomeLoopStageRowsSkeleton,
} from './HomeLoopStageRows';

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for staged rows and done chips. The canonical stories stay
 * in HomeLoopStageRows.stories.tsx; these show the skeleton, an empty read,
 * rows without links and the document direction.
 */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopStageRows States',
  component: HomeLoopStageRows,
  parameters: { layout: 'padded' },
  args: { stages: HOME_LOOP_FIXTURE_STAGES, rows: HOME_LOOP_FIXTURE_ROWS },
} satisfies Meta<typeof HomeLoopStageRows>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the skeleton matches a capped, populated list. */
export const LoadingSkeleton: Story = {
  render: () => <HomeLoopStageRowsSkeleton rows={4} />,
};

/** Empty: no rows in flight leaves only the stage legend. */
export const EmptyRows: Story = { args: { rows: [] } };

/**
 * Partial: some rows link out and some do not, one finished its last stage,
 * and the done chips mix verified and merely landed work.
 */
export const PartialLinksAndVerification: Story = {
  args: {
    rows: HOME_LOOP_FIXTURE_ROWS.map((row, index) =>
      index === 0
        ? { ...row, url: `https://linear.app/jovie/issue/${row.identifier}` }
        : index === 3
          ? { ...row, complete: true }
          : row
    ),
  },
  render: args => (
    <div className='flex flex-col gap-3'>
      <HomeLoopStageRows {...args} />
      <HomeLoopDoneChips
        items={HOME_LOOP_FIXTURE_DONE.map((item, index) =>
          index === 0 ? { ...item, url: 'https://github.com/JovieInc' } : item
        )}
        summary={null}
      />
    </div>
  ),
};

/** Right-to-left: rows inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    rows: HOME_LOOP_FIXTURE_ROWS.map((row, index) =>
      index === 0 ? { ...row, title: 'إصلاح فشل رمز تسجيل الدخول' } : row
    ),
  },
  decorators: [RtlFrame],
};
