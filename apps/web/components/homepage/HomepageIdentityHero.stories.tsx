import '@/app/(home)/home.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { HomepageIdentityHero } from './HomepageIdentityHero';

const meta = {
  title: 'Marketing/HomepageIdentityHero',
  component: HomepageIdentityHero,
  decorators: [
    Story => (
      <div className='home-viewport'>
        <RenderedFamily
          name='homepage-identity-hero'
          owner='HomepageIdentityHero'
          keyboardTargetSelector='button[data-testid="homepage-primary-cta"]'
          interactive
        >
          <Story />
        </RenderedFamily>
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Centered homepage entry with the canonical wordmark, one headline and the existing handle-claim form. Explanatory copy follows the first viewport. Claim routing and the populated profile review before auth stay with their existing owners.',
      },
    },
  },
} satisfies Meta<typeof HomepageIdentityHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headingId: 'homepage-identity-hero-heading',
  },
};
