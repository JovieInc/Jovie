import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Bell, PanelRight, Settings } from 'lucide-react';
import { DashboardHeaderActionButton } from './DashboardHeaderActionButton';

const meta = {
  title: 'Dashboard/Atoms/DashboardHeaderActionButton',
  component: DashboardHeaderActionButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    ariaLabel: 'Toggle notifications',
    icon: <Bell className='h-3.5 w-3.5' />,
  },
} satisfies Meta<typeof DashboardHeaderActionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconOnly: Story = {
  args: {
    iconOnly: true,
    tooltipLabel: 'Notifications',
  },
};

export const WithLabel: Story = {
  args: {
    icon: <Settings className='h-3.5 w-3.5' />,
    label: 'Settings',
    ariaLabel: 'Open settings',
  },
};

export const Pressed: Story = {
  args: {
    icon: <PanelRight className='h-3.5 w-3.5' />,
    label: 'Details',
    ariaLabel: 'Toggle details sidebar',
    pressed: true,
  },
};

export const Disabled: Story = {
  args: {
    iconOnly: true,
    disabled: true,
    tooltipLabel: 'Unavailable',
  },
};

export const HideLabelOnMobile: Story = {
  args: {
    icon: <Settings className='h-3.5 w-3.5' />,
    label: 'Settings',
    ariaLabel: 'Open settings',
    hideLabelOnMobile: true,
  },
};
