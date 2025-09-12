import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistAvatar } from './ArtistAvatar';

const meta: Meta<typeof ArtistAvatar> = {
  title: 'Atoms/ArtistAvatar',
  component: ArtistAvatar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    priority: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    src: 'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952',
    alt: 'Ariana Grande',
    name: 'Ariana Grande',
    size: 'md',
  },
};

export const Small: Story = {
  args: {
    src: 'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952',
    alt: 'Ariana Grande',
    name: 'Ariana Grande',
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    src: 'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952',
    alt: 'Ariana Grande',
    name: 'Ariana Grande',
    size: 'lg',
  },
};

export const ExtraLarge: Story = {
  args: {
    src: 'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952',
    alt: 'Ariana Grande',
    name: 'Ariana Grande',
    size: 'xl',
  },
};

export const LocalImage: Story = {
  args: {
    src: '/images/avatars/music-maker.jpg',
    alt: 'Music Maker',
    name: 'Music Maker',
    size: 'md',
  },
};
