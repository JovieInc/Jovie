import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntitySidebarShell } from './EntitySidebarShell';

const meta: Meta<typeof EntitySidebarShell> = {
  title: 'Molecules/Drawer/EntitySidebarShell',
  component: EntitySidebarShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    ariaLabel: 'Release details',
    title: 'Release details',
    entityHeader: <div className='px-3 py-2'>Afterglow</div>,
    children: <div className='px-3 py-2'>Inspector content</div>,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Minimal: Story = {
  args: {
    headerMode: 'minimal',
    entityHeaderSurface: 'flat',
  },
};
