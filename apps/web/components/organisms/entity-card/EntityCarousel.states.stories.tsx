import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityCarousel } from './EntityCarousel';
import type { EntityCardModel } from './types';

const one: EntityCardModel = {
  id: 'release-1',
  kind: 'music',
  imageAlt: 'Midnight Echo artwork',
  eyebrow: 'Latest',
  title: 'Midnight Echo',
  meta: 'Single · 2026',
  cta: { label: 'Listen', href: '/artist/midnight-echo' },
};

const many: readonly EntityCardModel[] = Array.from({ length: 12 }, (_, i) => ({
  ...one,
  id: `release-${i + 1}`,
  title: `Midnight Echo Part ${i + 1} With A Very Long Descriptive Title`,
}));

/** Carousel states beyond the two base layouts. */
const meta = {
  title: 'Organisms/EntityCard/EntityCarousel/States',
  component: EntityCarousel,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-full max-w-sm overflow-hidden rounded-3xl bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { surface: 'pearl', layout: 'profile-landscape' },
} satisfies Meta<typeof EntityCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no cards, so no controls are drawn. */
export const EmptyNoItems: Story = { args: { items: [] } };

/** Partial: a single card, which hides the previous, next and dot controls. */
export const PartialSingleCard: Story = { args: { items: [one] } };

/** Long content: a dozen long-titled cards that collapse the dot window. */
export const LongContentManyCards: Story = { args: { items: many } };
