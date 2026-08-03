import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityCard } from './EntityCard';
import type { EntityCardModel } from './types';

const release: EntityCardModel = {
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
};

const unavailableShow: EntityCardModel = {
  id: 'show-1',
  kind: 'show',
  imageAlt: 'The Echo',
  title: 'The Echo',
  meta: 'Los Angeles, CA',
  datePill: { month: 'Aug', day: '15' },
  interactive: true,
  cta: { label: 'Sold Out', disabled: true },
};

const meta = {
  title: 'Organisms/EntityCard/EntityCard',
  component: EntityCard,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'light' },
  },
  decorators: [
    Story => (
      <div className='w-[20rem] rounded-3xl bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    model: release,
    surface: 'pearl',
    treatment: 'detailed',
  },
} satisfies Meta<typeof EntityCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Portrait: Story = {
  args: {
    anatomy: 'unified',
  },
};

export const ProfileLandscape: Story = {
  args: {
    anatomy: 'profile-landscape',
  },
};

export const UnavailableShow: Story = {
  args: {
    anatomy: 'profile-landscape',
    model: unavailableShow,
  },
};
