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

/**
 * Empty: a page passes no nav links. The header keeps the mark and the auth
 * actions and draws no empty nav row or menu button.
 */
export const EmptyNavLinks: Story = {
  render: () => (
    <div className='min-h-40 bg-base'>
      <MarketingHeader variant='landing' navLinks={[]} />
    </div>
  ),
};

/**
 * Partial: the page withholds the primary CTA (the invite-only homepage keeps
 * its one action in the hero), so only Log in remains beside the mark.
 */
export const PartialLogInOnly: Story = {
  render: () => (
    <div className='min-h-40 bg-base'>
      <MarketingHeader variant='landing' navLinks={[]} hidePrimaryCta />
    </div>
  ),
};

/** Long content: a long primary CTA label beside Log in on a narrow bar. */
export const LongContentCtaLabel: Story = {
  render: () => (
    <div className='min-h-40 bg-base'>
      <MarketingHeader
        variant='landing'
        primaryCta={{
          href: '/#request-invite',
          label: 'Request an invite to set up your page in the next wave',
        }}
      />
    </div>
  ),
};

/** Right-to-left: the landing header inside an RTL document. */
export const RtlArabicCta: Story = {
  render: () => (
    <div dir='rtl' className='min-h-40 bg-base'>
      <MarketingHeader
        variant='landing'
        primaryCta={{ href: '/#request-invite', label: 'اطلب دعوة' }}
      />
    </div>
  ),
};
