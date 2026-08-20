import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeaturedArtistsSection } from './FeaturedArtistsSection';

const meta = {
  title: 'Organisms/FeaturedArtistsSection',
  component: FeaturedArtistsSection,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'size',
        'gap',
        'paddingStart',
        'paddingEnd',
        'estimatedWidth',
        'rowHeight',
        'containerClassName',
        'itemClassName',
        'ariaLabel',
        'showNames',
      ],
    },
  },
  args: {
    creators: [
      {
        id: '1',
        handle: 'example-artist',
        name: 'Example Artist',
        src: '/apple-touch-icon.png',
      },
    ],
  },
} satisfies Meta<typeof FeaturedArtistsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
