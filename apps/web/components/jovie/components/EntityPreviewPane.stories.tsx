import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityPreviewPane } from './EntityPreviewPane';

const meta = {
  title: 'Jovie/EntityPreviewPane',
  component: EntityPreviewPane,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  args: { entity: { kind: 'artist', id: 'sasha', label: 'Sasha Waves' } },
} satisfies Meta<typeof EntityPreviewPane>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PersonFallback: Story = {};
export const Release: Story = {
  args: {
    entity: {
      kind: 'release',
      id: 'release',
      label: 'Never Say a Word',
      thumbnail: '/img/releases/never-say-a-word.jpg',
      meta: { kind: 'release', releaseType: 'single', totalTracks: 1 },
    },
  },
};
export const CalendarEvent: Story = {
  args: {
    entity: {
      kind: 'event',
      id: 'event',
      label: 'The Echo',
      meta: {
        kind: 'event',
        eventDate: '2026-10-23T20:00:00Z',
        city: 'Los Angeles',
      },
    },
  },
};
