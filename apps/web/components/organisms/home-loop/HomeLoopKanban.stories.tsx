import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HOME_LOOP_FIXTURE_BUSY_ROWS,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
} from './fixtures';
import { HomeLoopKanban } from './HomeLoopKanban';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopKanban',
  component: HomeLoopKanban,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='@container flex h-96 flex-col bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    stages: HOME_LOOP_FIXTURE_STAGES,
    rows: HOME_LOOP_FIXTURE_ROWS,
    moreHref: '/app/ov/shipping',
  },
} satisfies Meta<typeof HomeLoopKanban>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** More work than the lanes can show: each lane ends in "+N more". */
export const Overflowing: Story = {
  args: { rows: HOME_LOOP_FIXTURE_BUSY_ROWS },
};

export const Empty: Story = { args: { rows: [] } };
