import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityRow } from './OpportunityRow';

/** Row content states that the base story does not name. */
const meta: Meta<typeof OpportunityRow> = {
  title: 'Organisms/OpportunityCard/OpportunityRow/States',
  component: OpportunityRow,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <ul className='m-0 w-full max-w-3xl list-none bg-base p-4'>
        <Story />
      </ul>
    ),
  ],
  args: {
    id: 'row-1',
    state: 'new',
    title: 'Detroit listeners up 340%, book a show',
    metadata: 'Magic Stick · Mar 15 · 92% match · $2,000 fee',
    onPrimaryAction: () => undefined,
    onDismiss: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof OpportunityRow>;

/** Empty: a row with no metadata line. */
export const EmptyNoMetadata: Story = { args: { metadata: '' } };

/** Long content: a title and metadata far past the row width, which truncate. */
export const LongContentTruncates: Story = {
  args: {
    title:
      'Creator-performance pilot for an Example Brand campaign with a very long name that runs well past the edge of the row',
    metadata:
      '$7.5k-$12.5k · Alex Buyer @ Example Brand · Backstage · verified · score 75.0 · 90-day organic usage, no exclusivity, whitelisting and paid amplification included',
    primaryActionLabel: 'Approve buyer',
  },
};
