import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Icon } from '@/components/atoms/Icon';
import { DrawerMediaThumb } from './DrawerMediaThumb';

const meta = {
  title: 'Molecules/Drawer/DrawerMediaThumb',
  component: DrawerMediaThumb,
  parameters: { layout: 'centered' },
  args: {
    src: null,
    alt: 'Artist profile',
    fallback: <span className='text-sm text-secondary-token'>AR</span>,
    dimension: 48,
    sizes: '48px',
    sizeClassName: 'size-12',
  },
} satisfies Meta<typeof DrawerMediaThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

const artworkFallback = (
  <Icon
    name='AudioLines'
    className='h-6 w-6 text-tertiary-token'
    aria-hidden='true'
  />
);

export const Fallback: Story = {};

export const WithImage: Story = {
  args: { src: '/avatars/default-user.png' },
};

/** A release with no artwork yet: the release drawer's audio glyph holds the slot. */
export const EmptyNoArtwork: Story = {
  args: {
    src: null,
    alt: 'Midnight Static artwork',
    fallback: artworkFallback,
    dimension: 96,
    sizes: '96px',
    sizeClassName: 'h-24 w-24',
  },
};

/** The artwork URL 404s; the thumb drops the broken image and keeps its name. */
export const ErrorBrokenArtworkUrl: Story = {
  args: {
    src: '/images/demo/artwork-missing-404.png',
    alt: 'Midnight Static artwork',
    fallback: artworkFallback,
    dimension: 96,
    sizes: '96px',
    sizeClassName: 'h-24 w-24',
  },
};

/**
 * Artwork without a caption: next to a visible release title the thumb is
 * decorative, so an empty alt hides it from assistive tech.
 */
export const PartialNoAltText: Story = {
  args: {
    src: '/images/demo/artwork-2.png',
    alt: '',
    dimension: 40,
    sizes: '40px',
    sizeClassName: 'h-10 w-10',
  },
  render: args => (
    <div className='flex items-center gap-3'>
      <DrawerMediaThumb {...args} />
      <span className='text-sm text-primary-token'>Midnight Static</span>
    </div>
  ),
};

/** A long artist name lives in the accessible name; the slot keeps its size. */
export const LongContentAccessibleName: Story = {
  args: {
    src: null,
    alt: 'Maximilian Alexander Featherstonehaugh-Wolfeschlegelsteinhausen and the Midnight Static Orchestra',
    fallback: <span className='text-sm text-secondary-token'>MF</span>,
  },
  render: args => (
    <div className='flex w-60 items-center gap-3'>
      <DrawerMediaThumb {...args} />
      <span className='min-w-0 truncate text-sm text-primary-token'>
        {args.alt}
      </span>
    </div>
  ),
};

/** Arabic name and initials in a right-to-left drawer header. */
export const RtlArabicName: Story = {
  args: {
    src: null,
    alt: 'عمرو دياب',
    fallback: <span className='text-sm text-secondary-token'>ع د</span>,
  },
  render: args => (
    <div dir='rtl' lang='ar' className='flex items-center gap-3'>
      <DrawerMediaThumb {...args} />
      <span className='text-sm text-primary-token'>{args.alt}</span>
    </div>
  ),
};
