import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTWORK_FIT_CLASSNAME, ArtworkFrame } from './ArtworkFrame';

const meta = {
  title: 'Atoms/ArtworkFrame',
  component: ArtworkFrame,
  parameters: { layout: 'centered' },
  args: {
    size: 145,
    className: 'h-[145px] w-[145px] bg-surface-2',
    children: (
      <img
        alt='Never Say A Word artwork'
        className={`h-full w-full ${ARTWORK_FIT_CLASSNAME}`}
        src='https://placehold.co/640x640/111827/E5E7EB?text=Artwork'
      />
    ),
  },
} satisfies Meta<typeof ArtworkFrame>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
