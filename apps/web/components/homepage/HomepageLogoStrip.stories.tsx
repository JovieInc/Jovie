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
          'Homepage logo strip (JOV-7795, Pen NLLgg). Renders only permissioned, audience-neutral logo proof from PROOF_REGISTRY; the zero-proof path renders nothing.',
      },
    },
  },
} satisfies Meta<typeof HomepageLogoStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Today: no permissioned logos, so nothing renders. */
export const ZeroProof: Story = { args: { logoIds: [] } };

/** Layout fixture only; not a permission claim for these marks. */
export const WithLogos: Story = {
  args: { logoIds: ['awal', 'orchard', 'armada'] },
};
