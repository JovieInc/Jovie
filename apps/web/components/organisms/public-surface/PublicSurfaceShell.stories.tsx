import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicSurfaceShell } from './PublicSurfaceShell';

const meta = {
  title: 'Organisms/PublicSurface/PublicSurfaceShell',
  component: PublicSurfaceShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <p className='p-6 text-center text-sm text-primary-token'>
        Profile content
      </p>
    ),
  },
} satisfies Meta<typeof PublicSurfaceShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const GridPattern: Story = {
  args: {
    backgroundPattern: 'grid',
  },
};

export const WithGradientBlurs: Story = {
  args: {
    showGradientBlurs: true,
  },
};

export const WithAmbientMedia: Story = {
  args: {
    ambientMediaUrl: 'https://placehold.co/800x800',
  },
};
