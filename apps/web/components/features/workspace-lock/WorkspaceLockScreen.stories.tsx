import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { WorkspaceLockScreen } from './WorkspaceLockScreen';

const meta = {
  title: 'Features/WorkspaceLock/WorkspaceLockScreen',
  component: WorkspaceLockScreen,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof WorkspaceLockScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Locked: Story = {
  render: () => (
    <div className='h-96 w-128'>
      <WorkspaceLockScreen />
    </div>
  ),
};

/**
 * Storybook has no passkey or session backend, so pressing unlock fails the
 * way a real unconfirmed unlock does: the lock stays and the reason shows.
 */
async function pressUnlock(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    canvas.getByRole('button', { name: 'Unlock with passkey' })
  );
  const alert = await canvas.findByRole('alert', {}, { timeout: 10_000 });
  await expect(alert).not.toBeEmptyDOMElement();
}

export const ErrorUnlockFailed: Story = {
  render: () => (
    <div className='h-96 w-128'>
      <WorkspaceLockScreen />
    </div>
  ),
  play: async ({ canvasElement }) => pressUnlock(canvasElement),
};

/** A narrow window: the failure reason wraps under the anchored action. */
export const LongContentNarrowError: Story = {
  render: () => (
    <div className='h-96 w-64'>
      <WorkspaceLockScreen />
    </div>
  ),
  play: async ({ canvasElement }) => pressUnlock(canvasElement),
};

export const RtlLocked: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='h-96 w-128'>
      <WorkspaceLockScreen />
    </div>
  ),
};
