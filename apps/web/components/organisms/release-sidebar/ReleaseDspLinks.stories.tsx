import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import type { Release } from './types';

const release = {
  profileId: 'profile-1',
  id: 'rel_1',
  title: 'Midnight Drive',
  status: 'released',
  slug: 'midnight-drive',
  smartLinkPath: '/example/midnight-drive',
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/album/x',
      label: 'Spotify',
      path: '',
      isPrimary: true,
      source: 'ingested',
      updatedAt: '2026-09-12T00:00:00Z',
    },
  ],
  providerCounts: {
    canonical: 1,
    searchFallback: 0,
    unknown: 1,
    unresolvedProviders: ['apple_music'],
  },
} satisfies Release;

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseDspLinks',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: ReleaseDspLinks,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1024] },
    jovie: { uncoveredProps: ['showHeading'] },
  },
  args: {
    release,
    providerConfig: {
      spotify: { label: 'Spotify', accent: 'text-primary-token' },
      apple_music: { label: 'Apple Music', accent: 'text-primary-token' },
    } as Record<ProviderKey, { label: string; accent: string }>,
    isEditable: true,
    isAddingLink: false,
    newLinkUrl: '',
    selectedProvider: null,
    isAddingDspLink: false,
    isRemovingDspLink: null,
    onSetIsAddingLink: fn(),
    onSetNewLinkUrl: fn(),
    onSetSelectedProvider: fn(),
    onAddLink: fn().mockResolvedValue(undefined),
    onRemoveLink: fn().mockResolvedValue(undefined),
    onNewLinkKeyDown: fn(),
  },
} satisfies Meta<typeof ReleaseDspLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QuietList: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /Spotify/ })).toHaveAttribute(
      'href',
      release.providers[0].url
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Find' }));
    await expect(args.onSetSelectedProvider).toHaveBeenCalledWith(
      'apple_music'
    );
    await expect(args.onSetIsAddingLink).toHaveBeenCalledWith(true);
  },
};

export const ReadOnly: Story = {
  args: { isEditable: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Apple Music')).toBeVisible();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { release: { ...release, providers: [], providerCounts: undefined } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('No DSP links yet.')
    ).toBeVisible();
  },
};

export const AddLinkDraft: Story = {
  args: {
    isAddingLink: true,
    selectedProvider: 'apple_music',
    newLinkUrl: 'https://music.apple.com/album/example',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox')).toHaveValue(args.newLinkUrl);
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
    await expect(args.onAddLink).toHaveBeenCalledOnce();
  },
};

export const SavingLink: Story = {
  args: { ...AddLinkDraft.args, isAddingDspLink: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Adding...' })
    ).toBeDisabled();
  },
};

export const FailedSave: Story = {
  args: {
    ...AddLinkDraft.args,
    actionError: {
      title: 'Unable to add link',
      message: 'Your draft is saved. Try again.',
      actionLabel: 'Retry',
      onRetry: fn(),
    },
    onDismissActionError: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox')).toHaveValue(args.newLinkUrl);
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await expect(args.actionError?.onRetry).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
    await expect(args.onDismissActionError).toHaveBeenCalledOnce();
  },
};

export const RemovingLink: Story = {
  args: { isRemovingDspLink: 'spotify' },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Actions for Spotify' })
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole('menuitem', { name: 'Remove Spotify' })
    ).toHaveAttribute('aria-disabled', 'true');
  },
};
