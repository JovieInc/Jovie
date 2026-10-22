import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOME_LOOP_FIXTURE_STRIP } from './fixtures';
import { HomeLoopStageStrip } from './HomeLoopStageStrip';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopStageStrip',
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

export const Measured: Story = {};

export const NotPublished: Story = {
  args: { items: [], coverage: 'Stage events not published yet' },
};
