import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LOGO_PERMISSION_FIXTURES } from '@/data/product-truth/logo-permissions.fixture';
import { HomeTrustSection } from './HomeTrustSection';

const meta = {
  title: 'Marketing/Sections/HomeTrustSection',
  component: HomeTrustSection,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Canonical trust-logo owner. Renders only logos with an active permission for its placement (JOV-7795); these stories use example grants, not real permissions.',
      },
    },
  },
  args: {
    placement: { page: '/' },
    fixturePermissions: LOGO_PERMISSION_FIXTURES,
  },
} satisfies Meta<typeof HomeTrustSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {};

export const InlineStrip: Story = {
  args: { presentation: 'inline-strip' },
};

export const ArtistProfile: Story = {
  args: { presentation: 'artist-profile' },
};

/** No grant covers the placement, so nothing renders. */
export const NoPermission: Story = {
  args: { fixturePermissions: [] },
};
