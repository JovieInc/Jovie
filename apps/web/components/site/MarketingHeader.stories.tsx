import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { APP_ROUTES } from '@/constants/routes';
import { DEFAULT_SITE_CHROME } from '@/lib/content-records/site-chrome.defaults';
import { toResolvedSiteChrome } from '@/lib/content-records/site-chrome.resolve';
import { MarketingHeader } from './MarketingHeader';

const meta = {
  title: 'Site/MarketingHeader',
  component: MarketingHeader,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component:
          'Adjacent component coverage for the canonical shell.header story. HeaderNav remains the single navigation owner.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {
  render: () => (
    <div className='min-h-40 bg-base'>
      <MarketingHeader variant='landing' />
    </div>
  ),
};

export const Minimal: Story = {
  render: () => (
    <div className='min-h-40 bg-base'>
      <MarketingHeader
        variant='minimal'
        logoSize='sm'
        navLinks={[
          { href: APP_ROUTES.SUPPORT, label: 'Support' },
          { href: APP_ROUTES.PRICING, label: 'Pricing' },
        ]}
        primaryCta={{ href: '/signup', label: 'Request Access' }}
      />
    </div>
  ),
};

/** Header navigation from the published `site-chrome/main` record. */
export const PublishedChrome: Story = {
  render: () => (
    <div className='min-h-40 bg-base'>
      <MarketingHeader
        variant='landing'
        chromeNav={toResolvedSiteChrome(DEFAULT_SITE_CHROME).nav}
      />
    </div>
  ),
};
