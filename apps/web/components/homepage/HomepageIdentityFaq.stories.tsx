import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageIdentityFaq } from './HomepageIdentityFaq';

const meta = {
  title: 'Marketing/HomepageIdentityFaq',
  component: HomepageIdentityFaq,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Homepage FAQ (JOV-7795): the shared FaqSection with the identity homepage answers, mounted before the close.',
      },
    },
  },
} satisfies Meta<typeof HomepageIdentityFaq>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
