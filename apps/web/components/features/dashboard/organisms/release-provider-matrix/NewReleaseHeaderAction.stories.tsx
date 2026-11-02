import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NewReleaseHeaderAction } from './NewReleaseHeaderAction';

const meta = {
  title: 'Dashboard/Releases/NewReleaseHeaderAction',
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

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Create A New Release' })
    );
    await userEvent.click(
      await page.findByRole('menuitem', { name: 'Sync from Spotify' })
    );
    await expect(args.onSyncSpotify).toHaveBeenCalledTimes(1);
    await expect(page.getByRole('menu')).toBeVisible();
    await userEvent.click(page.getByRole('menuitem', { name: 'Add manually' }));
    await expect(args.onCreateManual).toHaveBeenCalledTimes(1);
    await expect(page.queryByRole('menu')).not.toBeInTheDocument();
  },
};

export const Syncing: Story = {
  args: { isSyncing: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', {
        name: 'Create A New Release',
      })
    );
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole('menuitem', { name: 'Syncing...' })
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByRole('menuitem', { name: 'Add manually' })
    ).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
  },
};

export const SpotifyOnly: Story = {
  args: { canCreateManualReleases: false },
};

export const SpotifyOnlySyncing: Story = {
  args: { canCreateManualReleases: false, isSyncing: true },
};
