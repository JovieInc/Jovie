import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ConnectedComponentsGallery } from './ConnectedComponentsGallery';

const meta = {
  title: 'Marketing/ConnectedComponentsGallery',
  component: ConnectedComponentsGallery,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Three-moment rail of real product pages (coming soon, out now, profile) from the screenshot registry. Shared by the cinematic homepage and the shader product pages.',
      },
    },
  },
} satisfies Meta<typeof ConnectedComponentsGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  tags: ['mobile-viewport'],
  parameters: {
    viewport: { defaultViewport: 'mobile' },
    chromatic: { disable: true },
  },
};
