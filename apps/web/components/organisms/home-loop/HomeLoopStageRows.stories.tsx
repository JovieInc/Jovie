import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOME_LOOP_FIXTURE_ROWS, HOME_LOOP_FIXTURE_STAGES } from './fixtures';
import { HomeLoopStageRows } from './HomeLoopStageRows';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopStageRows',
  component: HomeLoopStageRows,
  args: { stages: HOME_LOOP_FIXTURE_STAGES, rows: HOME_LOOP_FIXTURE_ROWS },
} satisfies Meta<typeof HomeLoopStageRows>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { rows: [] } };
export const Overflow: Story = { args: { maxRows: 3 } };
