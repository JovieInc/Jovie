import '@/app/(home)/home.css';
import '@/.storybook/production-fonts.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { LOGO_PERMISSION_FIXTURES } from '@/data/product-truth/logo-permissions.fixture';
import { HomepageIdentityHero } from './HomepageIdentityHero';
import { HomepageIdentityStoryStack } from './HomepageIdentityStoryStack';

const meta = {
  title: 'Marketing/HomepageIdentityHero',
  component: HomepageIdentityHero,
  decorators: [
    Story => (
      <div className='home-viewport storybook-production-fonts'>
        <MarketingHeader
          variant='minimal'
          overlay
          brand='icon'
          logoSize='sm'
          navLinks={[]}
        />
        <RenderedFamily
          name='homepage-identity-hero'
          owner='HomepageIdentityHero'
          keyboardTargetSelector='button[data-testid="homepage-primary-cta"]'
          interactive
        >
          <Story />
          <HomepageIdentityStoryStack />
        </RenderedFamily>
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full-bleed homepage entry with the canonical icon/Sign in header, one headline and the existing handle-claim form. Native scrolling reveals the editorial card and existing page sections. Claim routing and the populated profile review before auth stay with their existing owners.',
      },
    },
  },
} satisfies Meta<typeof HomepageIdentityHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headingId: 'homepage-identity-hero-heading',
    // Recovered AEMpX→Us7HF composition. Example grants are confined to this
    // component preview, never imported by the route or production logo gate.
    logoStrip: (
      <div data-homepage-testid='homepage-logo-strip'>
        <HomeTrustSection
          placement={{ page: '/', audience: 'general' }}
          fixturePermissions={LOGO_PERMISSION_FIXTURES}
          presentation='inline-strip'
          sectionVariant='homepage-identity'
          label='Trusted by artists and teams releasing on'
          ariaLabel='Artists and teams releasing on these labels'
        />
      </div>
    ),
  },
};
