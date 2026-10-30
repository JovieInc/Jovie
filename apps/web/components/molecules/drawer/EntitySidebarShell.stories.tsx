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

export const MinimalWithMobileDismissal: Story = {
  args: {
    headerMode: 'minimal',
    hideMinimalHeaderBar: true,
    showMobileDismissal: true,
    onClose: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    isEmpty: true,
    emptyMessage: 'Select a release to see details.',
    entityHeader: undefined,
    children: <div className='px-3 py-2'>Inspector content</div>,
  },
};

export const Partial: Story = {
  args: {
    title: 'Release details',
    entityHeader: undefined,
  },
};

export const LongContent: Story = {
  args: {
    title: 'Release details',
    entityHeader: (
      <div className='px-3 py-2'>
        The Very Long Artist Name and Collaborating Orchestra Live Session
      </div>
    ),
    children: (
      <div className='px-3 py-2'>
        A long inspector body that keeps scrolling well past the rail height to
        exercise the shell-owned scroll region and the pinned identity above it.
      </div>
    ),
  },
};

export const Rtl: Story = {
  args: {
    title: 'Release details',
  },
  decorators: [
    Story => (
      <div dir='rtl' className='h-screen'>
        <Story />
      </div>
    ),
  ],
};
