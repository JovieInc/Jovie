import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { HOME_LOOP_FIXTURE_ASKS, HOME_LOOP_FIXTURE_COPY } from './fixtures';
import { HomeLoopAsksSkeleton } from './HomeLoopAsks';
import { HomeLoopSection } from './HomeLoopSection';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopSection',
  component: HomeLoopSection,
  args: {
    title: HOME_LOOP_FIXTURE_COPY.asksTitle,
    status: 'ready',
    isEmpty: false,
    count: 2,
    emptyLabel: HOME_LOOP_FIXTURE_COPY.asksEmpty,
    errorLabel: HOME_LOOP_FIXTURE_COPY.asksError,
    onRetry: fn(),
    skeleton: <HomeLoopAsksSkeleton />,
    minBodyClassName: 'min-h-24',
    children: HOME_LOOP_FIXTURE_ASKS[0]?.title,
    testId: 'home-loop-asks-section',
  },
} satisfies Meta<typeof HomeLoopSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Loading: Story = { args: { status: 'loading' } };
export const Empty: Story = { args: { isEmpty: true, count: 0 } };
export const ErrorState: Story = { args: { status: 'error' } };
