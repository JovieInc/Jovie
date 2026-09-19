import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageClose } from './HomepageClose';

const meta = {
  title: 'Marketing/HomepageClose',
  component: HomepageClose,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The homepage close repeats the name search and offers a read-only agent onboarding payload with a visible clipboard fallback.',
      },
    },
  },
} satisfies Meta<typeof HomepageClose>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
