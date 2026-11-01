import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { ShellReleaseRow } from './ShellReleaseRow';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Lost in the Light',
  artistNames: ['Bahamas'],
  status: 'released',
  artworkUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f',
  slug: 'lost-in-the-light',
  smartLinkPath: '/lost-in-the-light',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  totalDurationMs: 214_000,
  releaseDate: '2026-06-15',
  weeklyStreams: 12_400,
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

const actionMenuItems: TableActionMenuItem[] = [
  { id: 'copy', label: 'Copy link' },
  { id: 'edit', label: 'Edit release' },
];

const meta = {
  title: 'Dashboard/Releases/ShellReleaseRow',
  component: ShellReleaseRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-4xl bg-surface-0 p-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    release,
    isSelected: false,
    onSelect: fn(),
    actionMenuItems,
  },
} satisfies Meta<typeof ShellReleaseRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DspDetails: Story = {
  parameters: { layout: 'fullscreen' },
  args: { onSelect: fn() },
  render: args => (
    <ul aria-label='Releases'>
      <ShellReleaseRow {...args} />
    </ul>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    const trigger = canvas.getByRole('button', {
      name: /^View DSP Distribution Details/i,
    });
    const row = canvas.getByRole('listitem', { name: release.title });
    const rowHeight = row.getBoundingClientRect().height;
    const rootFontSize = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );

    await expect(rowHeight).toBe(rootFontSize * 2);

    for (const activation of ['pointer', 'Enter', 'Space']) {
      if (activation === 'pointer') await userEvent.click(trigger);
      else {
        trigger.focus();
        await userEvent.keyboard(activation === 'Enter' ? '{Enter}' : ' ');
      }
      await expect(
        within(document.body).getByRole('dialog', {
          name: 'DSP Distribution Details',
        })
      ).toHaveFocus();
      await expect(args.onSelect).not.toHaveBeenCalled();

      await waitFor(() => {
        const dialog = within(document.body).getByRole('dialog', {
          name: 'DSP Distribution Details',
        });
        expect(dialog).toBeVisible();

        for (const name of ['Spotify', 'TIDAL']) {
          const label = within(dialog).getByText(name, { exact: true });
          const bounds = label.getBoundingClientRect();
          expect(bounds.width).toBeGreaterThan(0);
          expect(bounds.height).toBeGreaterThan(0);
          expect(bounds.top).toBeGreaterThanOrEqual(0);
          expect(bounds.bottom).toBeLessThanOrEqual(
            document.documentElement.clientHeight
          );
          const hit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2
          );
          expect(label.contains(hit)).toBe(true);
        }
        expect(row.getBoundingClientRect().height).toBe(rowHeight);
      });

      await userEvent.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          within(document.body).queryByRole('dialog')
        ).not.toBeInTheDocument()
      );
      await expect(trigger).toHaveFocus();
    }
  },
};

export const DspScrollableDetails: Story = {
  parameters: { layout: 'fullscreen' },
  args: {
    onSelect: fn(),
    release: {
      ...release,
      providers: (
        [
          'soundcloud',
          'deezer',
          'amazon_music',
          'bandcamp',
          'pandora',
          'qobuz',
        ] as const
      ).map(key => ({
        key,
        label: key,
        path: key,
        isPrimary: false,
        url: `https://example.com/releases/${key}`,
        source: 'manual',
        updatedAt: '2026-10-27',
      })),
    },
  },
  render: args => (
    <ul aria-label='Releases'>
      <ShellReleaseRow {...args} />
    </ul>
  ),
};

export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

export const Syncing: Story = {
  args: {
    syncStatus: 'refreshing',
  },
};

export const SmartLinkLocked: Story = {
  args: {
    smartLinkLockReason: 'scheduled',
  },
};
