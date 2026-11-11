import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import type {
  MarketingFooterColumn,
  MarketingFooterLink,
} from '@/data/marketingNavigation';
import { DEFAULT_SITE_CHROME } from '@/lib/content-records/site-chrome.defaults';
import { toResolvedSiteChrome } from '@/lib/content-records/site-chrome.resolve';
import { MarketingFooter } from './MarketingFooter';

const meta = {
  title: 'Site/MarketingFooter',
  component: MarketingFooter,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component:
          'Adjacent component coverage for the canonical shell.footer story. The central Marketing/Shells catalog owns the registry identity.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Minimal: Story = {
  render: () => (
    <div className='bg-base'>
      <MarketingFooter variant='minimal' showCta={false} />
    </div>
  ),
};

export const Expanded: Story = {
  render: () => (
    <div className='bg-base'>
      <MarketingFooter variant='expanded' showCta={false} />
    </div>
  ),
};

/** The published `site-chrome/main` record: three columns and a legal row. */
export const PublishedChrome: Story = {
  render: () => {
    const chrome = toResolvedSiteChrome(DEFAULT_SITE_CHROME);
    return (
      <div className='bg-base'>
        <MarketingFooter
          variant='expanded'
          showCta={false}
          columns={chrome.footerColumns}
          legalLinks={chrome.legalLinks}
        />
      </div>
    );
  },
};

/**
 * Empty: a published record with no link columns. The brand mark and the
 * legal row still render; the column grid collapses to nothing.
 */
export const EmptyPublishedColumns: Story = {
  render: () => (
    <div className='bg-base'>
      <MarketingFooter variant='expanded' showCta={false} columns={[]} />
    </div>
  ),
};

/**
 * Partial: a record that publishes a single column and leaves the legal row
 * to the code defaults (Privacy and Terms).
 */
export const PartialPublishedRecord: Story = {
  render: () => (
    <div className='bg-base'>
      <MarketingFooter
        variant='expanded'
        showCta={false}
        columns={[
          {
            title: 'Product',
            links: [
              { href: '/artist-profiles', label: 'Artist profiles' },
              { href: '/pricing', label: 'Pricing' },
            ],
          },
        ]}
      />
    </div>
  ),
};

const LONG_COLUMNS: readonly MarketingFooterColumn[] = [
  {
    title: 'Release tools for independent artists and labels',
    links: [
      { href: '/artist-profiles', label: 'Artist profiles and smart links' },
      { href: '/launch', label: 'Pre-save campaigns for every release' },
      { href: '/pricing', label: 'Pricing for artists, managers and labels' },
    ],
  },
  {
    title: 'Company and press resources',
    links: [
      { href: '/about', label: 'About Jovie Technology Inc.' },
      { href: '/blog', label: 'Stories from the release desk' },
    ],
  },
  {
    title: 'Developers and integrations',
    links: [
      { href: '/developers', label: 'Developer documentation and API' },
      { href: '/changelog', label: 'Changelog and release notes' },
    ],
  },
];

/** Long content: long column titles and link labels in the full footer. */
export const LongContentLabels: Story = {
  render: () => (
    <div className='bg-base'>
      <MarketingFooter
        variant='expanded'
        showCta={false}
        columns={LONG_COLUMNS}
      />
    </div>
  ),
};

const RTL_COLUMNS: readonly MarketingFooterColumn[] = [
  {
    title: 'المنتج',
    links: [
      { href: '/artist-profiles', label: 'ملفات الفنانين' },
      { href: '/pricing', label: 'الأسعار' },
    ],
  },
  {
    title: 'الشركة',
    links: [
      { href: '/about', label: 'من نحن' },
      { href: '/blog', label: 'المدونة' },
    ],
  },
];

const RTL_LEGAL: readonly MarketingFooterLink[] = [
  { href: '/legal/privacy', label: 'الخصوصية' },
  { href: '/legal/terms', label: 'الشروط' },
];

/** Right-to-left: Arabic columns and legal row in an RTL document. */
export const RtlArabicFooter: Story = {
  render: () => (
    <div className='bg-base' dir='rtl' lang='ar'>
      <MarketingFooter
        variant='expanded'
        showCta={false}
        columns={RTL_COLUMNS}
        legalLinks={RTL_LEGAL}
      />
    </div>
  ),
};
