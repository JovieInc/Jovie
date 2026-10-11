import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { SubscribeForm } from './SubscribeForm';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Profile/SubscribeForm',
  component: SubscribeForm,
  parameters: {
    layout: 'centered',
  },
  args: {
    artist: DEMO_ARTIST,
    presentation: 'inline',
  },
} satisfies Meta<typeof SubscribeForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneStep: Story = {};

export const TwoStep: Story = {
  args: {
    twoStep: true,
  },
};
