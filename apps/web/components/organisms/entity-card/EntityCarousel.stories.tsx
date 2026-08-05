import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityCarousel } from './EntityCarousel';
import type { EntityCardModel } from './types';

const items: readonly EntityCardModel[] = [
  {
    id: 'release-1',
    kind: 'music',
    href: '/artist/midnight-echo',
    imageUrl: '/img/releases/the-deep-end.jpg',
    imageAlt: 'Midnight Echo artwork',
    eyebrow: 'Latest',
    title: 'Midnight Echo',
    meta: 'Single · 2026',
    status: { label: 'Out Now', tone: 'live' },
    cta: { label: 'Listen', href: '/artist/midnight-echo' },
  },
  {
    id: 'merch-1',
    kind: 'merch',
    href: '/artist/merch/merch-1',
    imageAlt: 'Tour shirt',
    eyebrow: 'Merch',
    title: 'Midnight Tour Tee',
    meta: '$35.00',
    cta: { label: 'Shop', href: '/artist/merch/merch-1' },
  },
];

const meta = {
  title: 'Organisms/EntityCard/EntityCarousel',
  component: EntityCarousel,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'light' },
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  decorators: [
    Story => (
      <div className='w-[22rem] overflow-hidden rounded-3xl bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    items,
    surface: 'pearl',
  },
} satisfies Meta<typeof EntityCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Portrait: Story = {};

export const ProfileLandscape: Story = {
  args: {
    layout: 'profile-landscape',
  },
  play: async ({ canvasElement }) => {
    const first = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Go to item 1"]'
    );
    if (first?.getAttribute('aria-current') !== 'true') {
      throw new Error('First carousel dot must be selected at rest');
    }
  },
};
