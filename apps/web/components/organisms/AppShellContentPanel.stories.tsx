import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AppShellContentPanel } from './AppShellContentPanel';

const meta = {
  title: 'Organisms/AppShellContentPanel',
  component: AppShellContentPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    children: <div className='min-h-48'>Authenticated page content</div>,
  },
} satisfies Meta<typeof AppShellContentPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TableSurface: Story = {
  args: {
    surfaceMode: 'table',
    contentPadding: 'none',
    toolbar: <div className='border-b border-subtle p-3'>Table toolbar</div>,
  },
};

export const SettingsPageScroll: Story = {
  args: {
    maxWidth: 'wide',
    frame: 'none',
    contentPadding: 'none',
    scroll: 'page',
  },
};
