import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { TrayChip } from '../hooks/useChipTray';
import { ChipTray } from './ChipTray';

const chips: readonly TrayChip[] = [
  { uid: 'chip-skill', type: 'skill', id: 'generateAlbumArt' },
  {
    uid: 'chip-release',
    type: 'entity',
    kind: 'release',
    id: 'rel_1',
    label: 'Midnight Drive',
  },
];

const meta = {
  title: 'Jovie/ChipTray',
  component: ChipTray,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='flex w-80 flex-wrap gap-1.5 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    chips,
    onRemoveAt: fn(),
  },
} satisfies Meta<typeof ChipTray>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A skill pill and a release mention; each close button removes its chip. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove Midnight Drive' })
    );
    await expect(args.onRemoveAt).toHaveBeenCalledWith(1);
  },
};

/** Empty: with no chips the tray renders nothing and takes no space. */
export const EmptyTray: Story = {
  args: {
    chips: [],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByTestId('chat-input-chip-tray')
    ).toBeNull();
  },
};

/** Long content: long labels truncate inside each pill; remove stays visible. */
export const LongContentLabels: Story = {
  args: {
    chips: [
      { uid: 'chip-skill', type: 'skill', id: 'generateReleasePitch' },
      {
        uid: 'chip-release-long',
        type: 'entity',
        kind: 'release',
        id: 'rel_long',
        label:
          'Midnight Drive (Deluxe Anniversary Edition) [Remastered Extended Mix]',
      },
      {
        uid: 'chip-artist-long',
        type: 'entity',
        kind: 'artist',
        id: 'art_long',
        label:
          'The Midnight Collective featuring the Downtown Strings Ensemble',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', {
        name: 'Remove The Midnight Collective featuring the Downtown Strings Ensemble',
      })
    ).toBeVisible();
  },
};

/** Right-to-left: Arabic mention labels inside an RTL composer. */
export const RtlArabicLabels: Story = {
  args: {
    chips: [
      {
        uid: 'chip-release-ar',
        type: 'entity',
        kind: 'release',
        id: 'rel_ar',
        label: 'ليلة في القاهرة',
      },
      {
        uid: 'chip-artist-ar',
        type: 'entity',
        kind: 'artist',
        id: 'art_ar',
        label: 'عمرو دياب',
      },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
