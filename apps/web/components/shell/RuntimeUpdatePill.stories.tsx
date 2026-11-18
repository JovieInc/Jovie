import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { RuntimeUpdatePill } from './RuntimeUpdatePill';

const meta = {
  title: 'Shell/RuntimeUpdatePill',
  component: RuntimeUpdatePill,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Reload Jovie to update',
    description: 'New Version Available (v26.9.1). Reload when ready.',
    busy: false,
    onApply: fn(),
  },
  decorators: [
    Story => (
      <div className='relative h-60 w-full bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RuntimeUpdatePill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReloadOnWeb: Story = {};

export const RestartOnDesktop: Story = {
  args: {
    title: 'Restart Jovie to update',
    description: 'Install the available update when you are ready.',
  },
};

/** Busy while the reload or desktop restart is under way; presses are ignored. */
export const LoadingUpdating: Story = {
  args: {
    title: 'Updating Jovie…',
    description: 'Installing the update and restarting Jovie…',
    busy: true,
  },
};

/** A long title truncates inside the capped pill instead of growing over the page. */
export const LongContent: Story = {
  args: {
    title:
      'Restart Jovie to install the latest desktop update and keep working',
    description: 'Install the available update when you are ready.',
  },
};

/** The pill pins to the inline end corner, so RTL puts it bottom-left. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
