import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ConsentBanner } from './ConsentBanner';

const meta = {
  title: 'Tracking/ConsentBanner',
  component: ConsentBanner,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ConsentBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
