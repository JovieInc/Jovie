import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeroSpotifySearch } from './HeroSpotifySearch';

const meta = {
  title: 'Marketing/Sections/HeroSpotifySearch',
  component: HeroSpotifySearch,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Spotify artist search for the homepage hero. The `editorial` appearance renders the single-pill homepage style; `default` keeps the Spotify-badged field. Selection routes into /start with a Spotify-first starter prompt.',
      },
    },
  },
} satisfies Meta<typeof HeroSpotifySearch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Editorial: Story = {
  args: {
    appearance: 'editorial',
    inputId: 'homepage-name-search',
    placeholder: 'Search your name',
    submitLabel: 'Find me',
    submitTestId: 'homepage-primary-cta',
  },
};
