import '@/app/globals.css';
import type { ReactNode } from 'react';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { HomeLoopRow } from '@/lib/home-loop/contract';
import { HOME_LOOP_FIXTURE_ROWS, HOME_LOOP_FIXTURE_STAGES } from './fixtures';
import { HomeLoopKanban } from './HomeLoopKanban';

function Frame(Story: () => ReactNode) {
  return (
    <div className='@container flex h-96 flex-col bg-base p-4'>
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
 * State coverage for the in-flight board. The canonical stories stay in
 * HomeLoopKanban.stories.tsx; these use the same frame and change the rows
 * and the document direction.
 */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopKanban States',
  component: HomeLoopKanban,
  parameters: { layout: 'fullscreen' },
  decorators: [Frame],
  args: {
    stages: HOME_LOOP_FIXTURE_STAGES,
    rows: HOME_LOOP_FIXTURE_ROWS,
    moreHref: '/app/ov/shipping',
  },
} satisfies Meta<typeof HomeLoopKanban>;

export default meta;
type Story = StoryObj<typeof meta>;

const linked = (row: HomeLoopRow, index: number): HomeLoopRow =>
  index % 2 === 0
    ? { ...row, url: `https://linear.app/jovie/issue/${row.identifier}` }
    : row;

/**
 * Partial: only some cards carry a link, and only two of the six stages have
 * work; the other lanes stay as empty frames.
 */
export const PartialStagesAndLinks: Story = {
  args: {
    rows: HOME_LOOP_FIXTURE_ROWS.filter(row => row.stageIndex <= 1).map(linked),
  },
};

/** Right-to-left: the board inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    rows: HOME_LOOP_FIXTURE_ROWS.map((row, index) =>
      index === 0 ? { ...row, title: 'إصلاح فشل رمز تسجيل الدخول' } : row
    ),
  },
  decorators: [RtlFrame],
};
