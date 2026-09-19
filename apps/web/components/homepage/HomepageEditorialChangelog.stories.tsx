import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageEditorialChangelog } from './HomepageEditorialChangelog';

const meta = {
  title: 'Marketing/HomepageEditorialChangelog',
  component: HomepageEditorialChangelog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Preview of published customer-facing releases beneath the editorial body. Cards link to real changelog entries so a preview cannot become an unlinked product claim.',
      },
    },
  },
} satisfies Meta<typeof HomepageEditorialChangelog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
