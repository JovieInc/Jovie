import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
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

/** Tap between tabs to feel the shared lens spring and the glyph press. */
export const Interactive: Story = {
  render: function InteractiveBottomTabBar(args) {
    const [activeTab, setActiveTab] = useState(args.activeTab);
    return (
      <BottomTabBar
        {...args}
        activeTab={activeTab}
        onTabSelect={mode => {
          setActiveTab(mode);
          args.onTabSelect(mode);
        }}
      />
    );
  },
};
