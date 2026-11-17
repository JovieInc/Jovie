import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './atoms/button';
import { UpdatingScreen } from './updating-screen';

const meta = {
  title: 'UI/Patterns/UpdatingScreen',
  component: UpdatingScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Updating Jovie',
    description: 'Keep working. Jovie tells you when it is ready.',
    progressLabel: 'Download progress',
    progress: 35,
    actions: (
      <Button variant='ghost' asChild>
        <a href='https://jov.ie/download'>Download the latest version</a>
      </Button>
    ),
  },
} satisfies Meta<typeof UpdatingScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Light: Story = {
  decorators: [
    Story => (
      <div data-proof-theme='light' style={{ colorScheme: 'light' }}>
        <Story />
      </div>
    ),
  ],
};
export const Empty: Story = {
  args: { progress: 0, details: 'Starting download' },
};
export const Loading: Story = {
  args: { progress: undefined, details: 'Preparing update' },
};
export const Partial: Story = {
  args: { progress: 64, details: '128 MB of 200 MB' },
};
export const Ready: Story = {
  args: {
    state: 'ready',
    title: 'Ready to restart',
    description: 'Restart Jovie to finish installing the update.',
    actions: <Button variant='primary'>Restart To Update</Button>,
  },
};
export const Error: Story = {
  args: {
    state: 'error',
    title: 'Update did not download',
    description: 'Check your connection and try again.',
    actions: <Button variant='primary'>Try Again</Button>,
  },
};
export const PermissionDenied: Story = {
  args: {
    state: 'error',
    title: 'Update could not be installed',
    description:
      'You do not have permission to replace this app. Contact your administrator.',
  },
};
export const Disabled: Story = {
  args: {
    state: 'ready',
    title: 'Restarting Jovie',
    description: 'Jovie will reopen when the update is installed.',
    actions: <Button disabled>Restarting</Button>,
  },
};
export const LongContent: Story = {
  args: {
    title: 'Downloading the latest Jovie update',
    description:
      'This update is taking longer than usual. You can keep working and return when the download is ready.',
    details: '1.2 GB of 2.4 GB',
  },
};
export const Compact: Story = {
  globals: { viewport: { value: 'mobile1' } },
};
export const Embedded: Story = {
  args: { layout: 'embedded' },
  decorators: [
    Story => (
      <div className='mx-auto max-w-sm bg-surface-1 p-6'>
        <Story />
      </div>
    ),
  ],
};

export const Offline: Story = {
  args: {
    state: 'error',
    title: 'Download paused',
    description: 'You are offline. Reconnect to try again.',
    actions: <Button variant='primary'>Try Again</Button>,
  },
};
export const RtlOverflow: Story = {
  ...LongContent,
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
