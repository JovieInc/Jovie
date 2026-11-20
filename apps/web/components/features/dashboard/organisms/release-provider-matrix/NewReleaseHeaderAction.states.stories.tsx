import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NewReleaseHeaderAction } from './NewReleaseHeaderAction';

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Releases/NewReleaseHeaderAction States',
  component: NewReleaseHeaderAction,
  parameters: { layout: 'centered' },
  args: {
    canCreateManualReleases: true,
    isSyncing: false,
    onSyncSpotify: fn(),
    onCreateManual: fn(),
  },
} satisfies Meta<typeof NewReleaseHeaderAction>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Permission denied: the plan has no manual creation, so only sync is offered. */
export const PermissionDeniedManualCreation: Story = {
  args: { canCreateManualReleases: false },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole('button', { name: 'Create A New Release' })
    ).toBeNull();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Sync from Spotify' })
    );
    await expect(args.onSyncSpotify).toHaveBeenCalledTimes(1);
    await expect(args.onCreateManual).not.toHaveBeenCalled();
  },
};

/** Right-to-left: the menu trigger inside an RTL document. */
export const RtlNewRelease: Story = {
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Create A New Release',
      })
    ).toBeVisible();
  },
};
