import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicSurfaceStage } from './PublicSurfaceStage';

const meta = {
  title: 'Organisms/PublicSurface/PublicSurfaceStage',
  component: PublicSurfaceStage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <p className='p-6 text-center text-sm text-primary-token'>
        Profile card content
      </p>
    ),
  },
} satisfies Meta<typeof PublicSurfaceStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAfterPanel: Story = {
  args: {
    afterPanel: (
      <p className='mt-4 text-center text-2xs text-tertiary-token'>
        Powered by Jovie
      </p>
    ),
  },
};
