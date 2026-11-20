import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityMentionSpan } from './EntityMentionSpan';

const meta = {
  title: 'Jovie/EntityMentionSpan',
  component: EntityMentionSpan,
  args: { kind: 'artist', label: '9.9K followers' },
} satisfies Meta<typeof EntityMentionSpan>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A long release title inside a narrow assistant bubble wraps with the prose. */
export const LongLabel: Story = {
  args: {
    kind: 'release',
    label:
      'The Extended Midnight Drive Sessions (Deluxe Anniversary Edition, Remastered)',
  },
  decorators: [
    Story => (
      <p className='w-64 text-sm text-primary-token'>
        Your latest release <Story /> is now live everywhere.
      </p>
    ),
  ],
};

/** Right-to-left transcript copy keeps the accent underline under the label. */
export const RtlMention: Story = {
  args: { kind: 'track', label: 'ليلة في القاهرة' },
  decorators: [
    Story => (
      <p dir='rtl' lang='ar' className='w-64 text-sm text-primary-token'>
        استمع إلى <Story /> الليلة.
      </p>
    ),
  ],
};
