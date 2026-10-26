import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageClaimClose } from './HomepageClaimClose';

const meta: Meta<typeof HomepageClaimClose> = {
  title: 'Marketing/Homepage/HomepageClaimClose',
  component: HomepageClaimClose,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
