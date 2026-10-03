import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { TrayChip } from '../hooks/useChipTray';
import { ChipTray } from './ChipTray';

const meta = {
  title: 'Jovie/ChipTray',
  component: ChipTray,
  parameters: {
    layout: 'centered',
  },
  args: {
    onRemoveAt: () => {},
  },
} satisfies Meta<typeof ChipTray>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedChips: Story = {
  args: {
    chips: [
      { type: 'skill', id: 'generateAlbumArt', uid: 'chip-1' },
      {
        type: 'entity',
        kind: 'release',
        id: 'rel_1',
        label: 'Midnight Drive',
        uid: 'chip-2',
      },
      {
        type: 'entity',
        kind: 'artist',
        id: 'artist_1',
        label: 'Porter Robinson',
        uid: 'chip-3',
      },
    ] satisfies readonly TrayChip[],
  },
};

export const Empty: Story = {
  args: {
    chips: [],
  },
};
