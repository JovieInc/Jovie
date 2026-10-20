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
  args: { tiles: HOME_LOOP_FIXTURE_PULSE },
} satisfies Meta<typeof HomeLoopPulse>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Loading: Story = { args: { loading: true, tiles: [] } };
export const Empty: Story = { args: { tiles: [] } };
export const NotMeasured: Story = {
  args: { tiles: HOME_LOOP_FIXTURE_UNMEASURED_PULSE },
};
