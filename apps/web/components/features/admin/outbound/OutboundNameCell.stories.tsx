import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

const meta = {
  title: 'Admin/Outbound/NameCell',
  component: OutboundNameCell,
  decorators: [
    Story => (
      <div className='flex h-10 w-48 items-center bg-base px-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { row: outboundFixtureRow() },
} satisfies Meta<typeof OutboundNameCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongImportedIdentity: Story = {
  args: {
    row: outboundFixtureRow({
      name: 'Ada — Listen on YouTube, Spotify, Apple Music',
      handle: 'ada_with_a_long_imported_handle',
    }),
  },
};

export const Flagged: Story = {
  args: {
    row: outboundFixtureRow({
      flags: ['possible_non_artist'],
      entityNote: 'Looks like a playlist curator or submission service',
    }),
  },
};

export const HeldForRelationship: Story = {
  args: {
    row: outboundFixtureRow({
      view: 'held',
      flags: ['existing_relationship'],
      relationshipHold: 'Existing relationship: flag to Tim, no cold outreach',
    }),
  },
};

export const RelationshipNote: Story = {
  args: {
    row: outboundFixtureRow({
      relationshipNotes: ["Relationship: Armada Music, Tim's vocalist deals"],
    }),
  },
};
