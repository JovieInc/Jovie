import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarBottomNowPlayingBridge } from './SidebarBottomNowPlayingBridge';

const meta = {
  title: 'Organisms/SidebarBottomNowPlayingBridge',
  component: SidebarBottomNowPlayingBridge,
  parameters: { layout: 'centered' },
  decorators: [
    StoryComponent => (
      <div className='w-57 bg-base p-2'>
        <StoryComponent />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarBottomNowPlayingBridge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The production bridge stays empty until the shared player has an active track. */
export const Idle: Story = {};

export const CollapsedSidebarIdle: Story = {
  args: { collapsed: true },
};
