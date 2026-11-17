import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

const meta: Meta<typeof OutboundNameCell> = {
  title: 'Admin/Outbound/NameCell',
  component: OutboundNameCell,
};

export default meta;
type Story = StoryObj<typeof OutboundNameCell>;

export const Default: Story = { args: { row: outboundFixtureRow() } };

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
