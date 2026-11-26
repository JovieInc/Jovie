import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityCard } from './EntityCard';

/** Content states of the entity card that the base stories do not name. */
const meta = {
  title: 'Organisms/EntityCard/EntityCard/States',
  component: EntityCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80 rounded-3xl bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { surface: 'app', treatment: 'detailed' },
} satisfies Meta<typeof EntityCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: only the required title and alt text, with no media, meta or CTA. */
export const EmptyTitleOnly: Story = {
  args: {
    model: { id: 'empty', kind: 'person', imageAlt: '', title: 'New Artist' },
  },
};

/** Partial: a show with a date pill and no venue meta or image. */
export const PartialShowWithoutMeta: Story = {
  args: {
    model: {
      id: 'partial',
      kind: 'show',
      imageAlt: 'Show',
      title: 'The Echo',
      datePill: { month: 'Aug', day: '15' },
      interactive: true,
      cta: { label: 'Get Tickets', onClick: () => undefined },
    },
  },
};

/** Long content: a title, meta and status far longer than the card. */
export const LongContentOverflow: Story = {
  args: {
    model: {
      id: 'long',
      kind: 'music',
      imageAlt: 'Artwork',
      eyebrow: 'Latest Release From The Studio',
      title:
        'An Extremely Long Release Title That Needs To Truncate Instead Of Growing The Card',
      meta: 'Deluxe Edition · Remastered · Anniversary Reissue · 2026',
      status: { label: 'Out Now Everywhere', tone: 'live' },
      cta: { label: 'Listen Now', href: '/artist/long' },
    },
  },
};
