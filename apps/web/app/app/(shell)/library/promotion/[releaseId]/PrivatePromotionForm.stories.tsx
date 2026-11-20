import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PrivatePromotionForm } from './PrivatePromotionForm';

const meta = {
  title: 'App/Library/Private promotion',
  component: PrivatePromotionForm,
  args: {
    profileId: 'example-owner',
    releaseId: 'example-release',
    title: 'Window seat',
    context: { phase: 'upcoming', destination: null },
  },
} satisfies Meta<typeof PrivatePromotionForm>;
export default meta;
export const Upcoming: StoryObj<typeof meta> = {};
