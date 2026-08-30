import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageNoScriptContent } from './HomepageNoScriptContent';

const meta = {
  title: 'Homepage/No-script content',
  component: HomepageNoScriptContent,
  parameters: {
    docs: {
      description: {
        component:
          'The canonical, user-readable homepage fallback emitted for clients that do not execute JavaScript.',
      },
    },
  },
} satisfies Meta<typeof HomepageNoScriptContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
