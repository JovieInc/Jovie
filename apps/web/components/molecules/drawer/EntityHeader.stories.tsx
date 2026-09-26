import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Radio } from 'lucide-react';
import {
  EntityHeader,
  EntityHeaderStatusGlyph,
  EntityHeaderThumbnail,
} from './EntityHeader';

const meta = {
  title: 'Molecules/Drawer/EntityHeader',
  component: EntityHeader,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EntityHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Release: Story = {
  args: {
    thumbnail: (
      <EntityHeaderThumbnail
        variant='artwork'
        name='Midnight Drive'
        src='https://placehold.co/112x112'
      />
    ),
    title: 'Midnight Drive',
    details: 'Tim White · Single',
    statusGlyph: (
      <EntityHeaderStatusGlyph
        icon={Radio}
        label='Live on DSPs'
        tone='positive'
      />
    ),
  },
};

export const Person: Story = {
  args: {
    thumbnail: <EntityHeaderThumbnail variant='person' name='Maya Vale' />,
    title: 'Maya Vale',
    details: 'Brand partnerships · Worldwide',
  },
};

export const Connection: Story = {
  args: {
    thumbnail: (
      <EntityHeaderThumbnail
        variant='connection'
        icon={<span className='text-xs font-semibold'>S</span>}
      />
    ),
    title: 'Spotify for Artists',
    details: 'Maya Vale · DSP',
  },
};
