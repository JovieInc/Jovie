import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HOME_LOOP_FIXTURE_DONE,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
} from './fixtures';
import { HomeLoopDoneChips, HomeLoopStageRows } from './HomeLoopStageRows';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopStageRows',
  component: HomeLoopStageRows,
  parameters: { layout: 'padded' },
  args: { stages: HOME_LOOP_FIXTURE_STAGES, rows: HOME_LOOP_FIXTURE_ROWS },
} satisfies Meta<typeof HomeLoopStageRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InFlight: Story = {};
export const Overflow: Story = { args: { maxRows: 3 } };
export const DoneToday: Story = {
  render: () => (
    <HomeLoopDoneChips items={HOME_LOOP_FIXTURE_DONE} summary='12 merges' />
  ),
};
