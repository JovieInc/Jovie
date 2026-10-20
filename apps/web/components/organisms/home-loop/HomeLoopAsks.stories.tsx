import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { HOME_LOOP_FIXTURE_ASKS } from './fixtures';
import { HomeLoopAsks } from './HomeLoopAsks';
import { AnsweredWithUndoWindow as answered } from './HomeLoopCanvas.stories';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopAsks',
  component: HomeLoopAsks,
  args: {
    asks: HOME_LOOP_FIXTURE_ASKS,
    answers: {},
    onApprove: fn(),
    onReply: fn(),
  },
} satisfies Meta<typeof HomeLoopAsks>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { asks: [] } };
export const AnsweredWithUndoWindow: Story = {
  args: answered.args,
};
