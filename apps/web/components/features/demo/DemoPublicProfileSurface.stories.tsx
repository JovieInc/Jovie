import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoPublicProfileSurface } from './DemoPublicProfileSurface';

const meta = {
  title: 'Features/Demo/DemoPublicProfileSurface',
  component: DemoPublicProfileSurface,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The real public-profile page rendered against a self-contained demo artist fixture, used inside the homepage-v2 hero phone.',
      },
    },
  },
} satisfies Meta<typeof DemoPublicProfileSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
