import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageQueryProvider } from '@/app/(home)/homepage-query-provider';
import { HomepageYoutubeMvp } from './HomepageYoutubeMvp';

const meta = {
  title: 'Marketing/HomepageYoutubeMvp',
  component: HomepageYoutubeMvp,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <HomepageQueryProvider>
        <Story />
      </HomepageQueryProvider>
    ),
  ],
} satisfies Meta<typeof HomepageYoutubeMvp>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
