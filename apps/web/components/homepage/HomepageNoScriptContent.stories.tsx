import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageNoScriptContent } from './HomepageNoScriptContent';

const meta = {
  title: 'Homepage/No-script content',
  component: HomepageNoScriptContent,
  parameters: {
    docs: {
      description: {
        component:
          'The canonical, user-readable homepage copy emitted in ordinary SSR HTML. Scripting-enabled browsers hide this fallback with the home stylesheet; clients without JavaScript keep the full public proposition and links.',
      },
    },
  },
} satisfies Meta<typeof HomepageNoScriptContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
