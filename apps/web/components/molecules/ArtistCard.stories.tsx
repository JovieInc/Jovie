import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistCard } from './ArtistCard';

const meta: Meta<typeof ArtistCard> = {
  title: 'Molecules/ArtistCard',
  component: ArtistCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    showName: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    handle: 'arianagrande',
    name: 'Ariana Grande',
    src: 'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952',
    size: 'md',
    showName: true,
  },
};

export const Small: Story = {
  args: {
    handle: 'arianagrande',
    name: 'Ariana Grande',
    src: 'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952',
    size: 'sm',
    showName: true,
  },
};

export const WithoutName: Story = {
  args: {
    handle: 'arianagrande',
    name: 'Ariana Grande',
    src: 'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952',
    size: 'md',
    showName: false,
  },
};

export const LocalImage: Story = {
  args: {
    handle: 'musicmaker',
    name: 'Music Maker',
    src: '/images/avatars/music-maker.jpg',
    size: 'md',
    showName: true,
  },
};
