import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingFullscreenParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { DEFAULT_SITE_CHROME } from '@/lib/content-records/site-chrome.defaults';
import { toResolvedSiteChrome } from '@/lib/content-records/site-chrome.resolve';
import { PublicPageShell } from './PublicPageShell';

const meta = {
  title: 'Site/PublicPageShell',
  component: PublicPageShell,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component:
          'Adjacent component coverage for the canonical shell.public-page story. Header, main offset, skip link, and footer remain composed from their canonical owners.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PublicPageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: null },
  render: () => (
    <PublicPageShell footerVariant='minimal' mainOffset={false}>
      <section className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-public-content'>
          <h1 className='text-3xl font-semibold'>Public page content</h1>
          <p className='mt-4 max-w-prose-canonical text-secondary-token'>
            The shell keeps navigation, skip access, main content, and footer
            composition in one public route frame.
          </p>
        </div>
      </section>
    </PublicPageShell>
  ),
};

export const MinimalHeaderWithoutSkipLink: Story = {
  args: { children: null },
  render: () => (
    <PublicPageShell
      footerVariant='minimal'
      headerVariant='minimal'
      mainOffset={false}
      skipToContent={false}
    >
      <section className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-public-content'>
          <h1 className='text-3xl font-semibold'>Minimal public frame</h1>
          <p className='mt-4 max-w-prose-canonical text-secondary-token'>
            Compact routes can opt out of the fixed-header offset and skip link
            when their surrounding layout owns those affordances.
          </p>
        </div>
      </section>
    </PublicPageShell>
  ),
};

/**
 * Partial: a published chrome record that ships the header nav and legal row
 * but only one footer column. The shell renders what is there.
 */
export const PartialPublishedChrome: Story = {
  args: { children: null },
  render: () => {
    const chrome = toResolvedSiteChrome(DEFAULT_SITE_CHROME);
    return (
      <PublicPageShell
        chrome={{ ...chrome, footerColumns: chrome.footerColumns.slice(0, 1) }}
        footerVariant='expanded'
        footerShowCta={false}
        mainOffset={false}
      >
        <section className='bg-base px-6 py-16 text-primary-token'>
          <div className='mx-auto max-w-public-content'>
            <h1 className='text-3xl font-semibold'>Partial site chrome</h1>
            <p className='mt-4 max-w-prose-canonical text-secondary-token'>
              One footer column is published; the rest of the frame keeps its
              defaults.
            </p>
          </div>
        </section>
      </PublicPageShell>
    );
  },
};

/**
 * The frame `app/brand/layout.tsx` renders: homepage header variant, icon
 * mark, expanded footer. The centre nav shows without any flag prop.
 */
export const BrandLayoutFrame: Story = {
  args: { children: null },
  render: () => (
    <PublicPageShell
      chrome={toResolvedSiteChrome(DEFAULT_SITE_CHROME)}
      className='system-b-marketing dark system-b-brand-layout'
      footerVariant='expanded'
      logoSize='sm'
      logoVariant='icon'
      mainClassName='system-b-brand-main'
      mainOffset={false}
      headerVariant='homepage'
    >
      <section className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-public-content'>
          <h1 className='text-3xl font-semibold'>Brand page content</h1>
          <p className='mt-4 max-w-prose-canonical text-secondary-token'>
            The brand route keeps the homepage header and the expanded footer.
          </p>
        </div>
      </section>
    </PublicPageShell>
  ),
};

/** Long content: a long headline, an unbroken URL and a long CTA label. */
export const LongContentPage: Story = {
  args: { children: null },
  render: () => (
    <PublicPageShell
      footerVariant='minimal'
      headerCta={{
        href: '/signup',
        label: 'Claim your free artist profile today',
      }}
      mainOffset={false}
    >
      <section className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-public-content'>
          <h1 className='text-3xl font-semibold'>
            Smart links, release pages, pre-saves and fan capture for
            independent artists, DJs, managers and labels everywhere
          </h1>
          <p className='mt-4 max-w-prose-canonical break-words text-secondary-token'>
            https://jov.ie/release/midnight-drive-extended-club-mix-feat-maya-vale-deluxe-anniversary-edition-2026
            stays inside the reading column, and the header and footer keep
            their own widths.
          </p>
        </div>
      </section>
    </PublicPageShell>
  ),
};

/** Right-to-left: an Arabic page inside the public frame. */
export const RtlArabicPage: Story = {
  args: { children: null },
  render: () => (
    <div dir='rtl' lang='ar'>
      <PublicPageShell footerVariant='minimal' mainOffset={false}>
        <section className='bg-base px-6 py-16 text-primary-token'>
          <div className='mx-auto max-w-public-content'>
            <h1 className='text-3xl font-semibold'>محتوى الصفحة العامة</h1>
            <p className='mt-4 max-w-prose-canonical text-secondary-token'>
              يحافظ الإطار على التنقل ورابط التخطي والمحتوى الرئيسي والتذييل في
              إطار واحد للصفحة العامة.
            </p>
          </div>
        </section>
      </PublicPageShell>
    </div>
  ),
};
