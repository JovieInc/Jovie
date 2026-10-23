import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AppShellFrameDedupe } from './AppShellFrameDedupe';

const meta = {
  title: 'Organisms/AppShellFrameDedupe',
  component: AppShellFrameDedupe,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AppShellFrameDedupe>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HiddenDuplicate: Story = {
  render: () => (
    <div className='min-h-40 bg-base p-4 text-sm'>
      <AppShellFrameDedupe />
      <div data-app-shell-frame='true' style={{ display: 'none' }}>
        Retained shell
      </div>
      <div data-app-shell-frame='true' className='h-24 w-full p-3'>
        Live shell keeps the frame landmark. The retained copy drops it.
      </div>
    </div>
  ),
};

export const SingleFrame: Story = {
  render: () => (
    <div className='min-h-40 bg-base p-4 text-sm'>
      <AppShellFrameDedupe />
      <div data-app-shell-frame='true' className='h-24 w-full p-3'>
        A lone frame keeps data-app-shell-frame.
      </div>
    </div>
  ),
};
