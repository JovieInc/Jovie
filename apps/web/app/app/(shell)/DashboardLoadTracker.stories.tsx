import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardLoadTracker } from './DashboardLoadTracker';

/**
 * The tracker returns null in every state: it records one dashboard_loaded
 * funnel event per user per browser session and draws nothing. The story
 * mounts it beside the shell copy it lives under, so the frame shows that
 * mounting it changes nothing on screen.
 */
const meta = {
  title: 'App/Shell/DashboardLoadTracker',
  component: DashboardLoadTracker,
  parameters: { layout: 'centered' },
  args: { pathname: '/app/chat', userId: 'story-user' },
} satisfies Meta<typeof DashboardLoadTracker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mounted inside the unlocked shell chrome on a signed-in route. */
export const MountedInShell: Story = {
  render: args => (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        The tracker mounts with no visible chrome. The shell around it renders
        unchanged.
      </p>
      <DashboardLoadTracker {...args} />
    </div>
  ),
};
