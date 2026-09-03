import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { BottomTabBar } from './BottomTabBar';

const meta = {
  title: 'Profile/Navigation/BottomTabBar',
  component: BottomTabBar,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex min-h-svh items-end justify-center bg-surface-0 px-4'>
        <div className='w-full max-w-sm'>
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    activeTab: 'profile',
    hasTourDates: true,
    showAlerts: true,
    isMenuOpen: false,
    onTabSelect: fn(),
    showAlertsTab: true,
  },
} satisfies Meta<typeof BottomTabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProfileActive: Story = {};

export const MusicActive: Story = {
  args: {
    activeTab: 'listen',
  },
};

export const MenuOpen: Story = {
  args: {
    isMenuOpen: true,
  },
};
