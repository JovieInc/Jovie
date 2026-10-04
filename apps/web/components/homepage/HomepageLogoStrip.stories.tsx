import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageLogoStrip } from './HomepageLogoStrip';

const meta = {
  title: 'Marketing/HomepageLogoStrip',
  component: HomepageLogoStrip,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Homepage logo strip (JOV-7795, Pen NLLgg). Renders only logos with an active permission covering `/`; with no grants it renders nothing.',
      },
    },
  },
} satisfies Meta<typeof HomepageLogoStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Today: no brand has granted permission, so nothing renders. */
export const ZeroPermissions: Story = {};
