import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeaturedCreatorsSection } from './FeaturedArtistsSection';

const meta: Meta<typeof FeaturedCreatorsSection> = {
  title: 'Organisms/FeaturedCreatorsSection',
  component: FeaturedCreatorsSection,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockCreators = [
  {
    id: '1',
    handle: 'arianagrande',
    name: 'Ariana Grande',
    src: 'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952',
  },
  {
    id: '2',
    handle: 'musicmaker',
    name: 'Music Maker',
    src: '/images/avatars/music-maker.jpg',
  },
  {
    id: '3',
    handle: 'popstar',
    name: 'Pop Star',
    src: '/images/avatars/pop-star.jpg',
  },
  {
    id: '4',
    handle: 'billieeilish',
    name: 'Billie Eilish',
    src: 'https://i.scdn.co/image/ab6761610000e5eb50defaf9fc059a1efc541f4c',
  },
];

export const Default: Story = {
  args: {
    creators: mockCreators,
    title: 'Featured Creators',
  },
};

export const CustomTitle: Story = {
  args: {
    creators: mockCreators,
    title: 'Popular Creators',
  },
};

export const SingleCreator: Story = {
  args: {
    creators: [mockCreators[0]],
    title: 'Featured Creator',
  },
};

export const ManyCreators: Story = {
  args: {
    creators: [
      ...mockCreators,
      ...mockCreators.map((creator, index) => ({
        ...creator,
        id: `${creator.id}-${index}`,
        handle: `${creator.handle}${index}`,
      })),
    ],
    title: 'All Creators',
  },
};
