import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HOME_LOOP_FIXTURE_PULSE,
  HOME_LOOP_FIXTURE_UNMEASURED_PULSE,
} from './fixtures';
import { HomeLoopPulse } from './HomeLoopPulse';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopPulse',
  component: HomeLoopPulse,
  parameters: { layout: 'padded' },
  args: { tiles: HOME_LOOP_FIXTURE_PULSE },
} satisfies Meta<typeof HomeLoopPulse>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Measured: Story = {};
export const Loading: Story = { args: { loading: true, tiles: [] } };
export const NotMeasured: Story = {
  args: { tiles: HOME_LOOP_FIXTURE_UNMEASURED_PULSE },
};

export const SnapshotProvenance: Story = {
  args: {
    tiles: [
      {
        ...HOME_LOOP_FIXTURE_PULSE[0],
        key: 'ejections',
        label: 'Queue ejections',
        value: '52%',
        target: 'Target ≤ 10%',
        sourceCaption: 'Snapshot 2026-11-07 14:24 UTC',
      },
    ],
  },
};
