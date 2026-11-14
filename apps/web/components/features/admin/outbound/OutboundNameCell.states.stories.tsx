import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

/** State coverage for the person cell: no tags, long copy, and RTL. */
const meta: Meta<typeof OutboundNameCell> = {
  title: 'Admin/Outbound/NameCell States',
  component: OutboundNameCell,
};

export default meta;
type Story = StoryObj<typeof OutboundNameCell>;

/** Empty: no hold, note or non-artist flag, so the cell shows no tags. */
export const EmptyNoTags: Story = {
  args: { row: outboundFixtureRow() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ada')).toBeVisible();
    await expect(canvas.queryByTestId('outbound-relationship-note')).toBeNull();
    await expect(
      canvas.queryByTestId('outbound-flag-existing-relationship')
    ).toBeNull();
  },
};

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';
const LONG_NOTE =
  "Relationship: Armada Music, Tim's vocalist deals across the last three release cycles and the spring remix package";

/** Long content: name, handle and notes truncate; full notes stay in titles. */
export const LongContentNameAndNotes: Story = {
  args: {
    row: outboundFixtureRow({
      name: LONG_NAME,
      handle: 'aurelia-montgomery-fitzgerald-official-account',
      flags: ['existing_relationship', 'possible_non_artist'],
      relationshipHold: 'Existing relationship: flag to Tim, no cold outreach',
      relationshipNotes: [LONG_NOTE],
      entityNote: 'Looks like a playlist curator or submission service',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_NAME)).toHaveClass('truncate');
    await expect(
      canvas.getByTestId('outbound-relationship-note')
    ).toHaveAttribute('title', LONG_NOTE);
  },
};

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** Right-to-left: avatar, name and tags mirror inside an RTL document. */
export const RtlNameAndNote: Story = {
  args: {
    row: outboundFixtureRow({
      name: 'ليلى الحسن',
      handle: 'layla',
      relationshipNotes: ['علاقة: شركة التسجيلات'],
    }),
  },
  decorators: [RtlDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('ليلى الحسن')).toBeVisible();
    await expect(
      canvas.getByTestId('outbound-relationship-note')
    ).toBeVisible();
  },
};
