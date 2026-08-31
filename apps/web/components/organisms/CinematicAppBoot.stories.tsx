import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CinematicAppBoot } from './CinematicAppBoot';

const meta = {
  title: 'Organisms/CinematicAppBoot',
  component: CinematicAppBoot,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof CinematicAppBoot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
