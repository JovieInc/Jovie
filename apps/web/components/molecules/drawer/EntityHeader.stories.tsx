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
    subtitle: 'Tim White · Single',
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
    subtitle: 'Brand partnerships · Worldwide',
  },
};

export const LongStableIdentity: Story = {
  args: {
    ...Person.args,
    title: 'The Very Long Artist Name and Collaborating Orchestra',
    subtitle: '@long-artist-name-and-orchestra',
    stableLayout: true,
    titleLineClamp: 1,
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
    subtitle: 'Maya Vale · DSP',
  },
};

export const VerifiedPerson: Story = {
  args: {
    ...Person.args,
    thumbnail: (
      <EntityHeaderThumbnail variant='person' name='Maya Vale' verified />
    ),
  },
};
export const Event: Story = {
  args: {
    title: 'Club Night',
    subtitle: 'Los Angeles',
    thumbnail: (
      <EntityHeaderThumbnail
        variant='event'
        name='Club Night'
        eventDate='2026-06-12'
      />
    ),
  },
};
export const MissingRelease: Story = {
  args: {
    title: 'Midnight Drive',
    subtitle: 'Single',
    thumbnail: (
      <EntityHeaderThumbnail variant='artwork' name='Midnight Drive' />
    ),
  },
};
export const BrokenPerson: Story = {
  args: {
    ...Person.args,
    thumbnail: (
      <EntityHeaderThumbnail
        variant='person'
        name='Maya Vale'
        src='/missing-identity.jpg'
        verified
      />
    ),
  },
};

const COMPLETE_ARTWORK = '/img/releases/never-say-a-word.jpg';

export const IdentityStates: Story = {
  render: () => (
    <div className='flex w-full flex-col gap-5'>
      <EntityHeader
        title='Maya Vale'
        subtitle='Verified profile'
        stableLayout
        thumbnail={
          <EntityHeaderThumbnail
            variant='person'
            name='Maya Vale'
            src='/identity-failure.jpg'
            verified
            data-testid='identity-person'
          />
        }
      />
      <EntityHeader
        title='Midnight Drive'
        subtitle='Single'
        stableLayout
        thumbnail={
          <EntityHeaderThumbnail
            variant='artwork'
            name='Midnight Drive artwork'
            src={COMPLETE_ARTWORK}
            data-testid='identity-release'
          />
        }
      />
      <EntityHeader
        title='Club Night'
        subtitle='Los Angeles'
        stableLayout
        thumbnail={
          <EntityHeaderThumbnail
            variant='event'
            name='Club Night date'
            eventDate='2026-06-12'
            data-testid='identity-event'
          />
        }
      />
    </div>
  ),
};
