import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
  CustomerChangelogEntry,
  CustomerChangelogMonthGroup,
} from '@/lib/customer-changelog';
import { CustomerChangelogArchive } from './CustomerChangelogArchive';
import '@/app/(marketing)/changelog/changelog-day-row.css';
import '@/app/(marketing)/changelog/changelog-editorial.css';

const ENTRY: CustomerChangelogEntry = {
  id: 'customer-update:brand-deals',
  aliases: [],
  title: 'Review qualified brand deals in your Inbox',
  slug: 'review-qualified-brand-deals-v26-8-1-0',
  date: '2026-08-16',
  summary: 'See the buyer, budget, and source.',
  category: 'new',
  capabilities: ['inbox'],
  surfaces: [],
  availability: 'ga',
  media: null,
  technicalVersion: '26.8.1',
  explanation: 'See the buyer, budget, and source.',
  supporting: [],
  action: null,
  technical: [],
  prominence: 'featured',
};

function month(
  monthKey: string,
  label: string,
  entries: readonly CustomerChangelogEntry[]
): CustomerChangelogMonthGroup {
  return { monthKey, label, entries };
}

const meta = {
  title: 'Marketing/Fixtures/CustomerChangelogArchive States',
  component: CustomerChangelogArchive,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithFeedPage(Story) {
      return (
        <section className='min-h-screen bg-page py-16 text-primary-token'>
          <div className='mx-auto w-full max-w-public-content px-6 sm:px-8 lg:px-10'>
            <Story />
          </div>
        </section>
      );
    },
  ],
  args: { months: [month('2026-08', 'August 2026', [ENTRY])] },
} satisfies Meta<typeof CustomerChangelogArchive>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the post's media fails to load and the post stays text-first. */
export const ErrorMediaFailed: Story = {
  args: {
    months: [
      month('2026-08', 'August 2026', [
        {
          ...ENTRY,
          media: {
            kind: 'image',
            src: '/images/changelog/missing-preview.webp',
            alt: 'Inbox showing a qualified brand deal',
          },
        },
      ]),
    ],
  },
};

/** Partial: a fixes-only month with no technical release links supplied. */
export const PartialFixesOnly: Story = {
  args: {
    months: [
      month('2026-07', 'July 2026', [
        {
          ...ENTRY,
          id: 'customer-update:sign-out',
          slug: 'sign-out-stays-available-v26-7-0-0',
          title: 'Sign-out stays available when the store is missing',
          date: '2026-07-21',
          explanation: '',
          category: 'fixed',
          prominence: 'small',
        },
      ]),
    ],
  },
};

/** Long content: many months behind Load earlier, and long post copy. */
export const LongContentManyMonths: Story = {
  args: {
    months: Array.from({ length: 6 }, (_, index) =>
      month(`2026-${String(8 - index).padStart(2, '0')}`, `Month ${index}`, [
        {
          ...ENTRY,
          id: `customer-update:long-${index}`,
          slug: `long-${index}`,
          date: `2026-${String(8 - index).padStart(2, '0')}-16`,
          title: `Review qualified brand deals in your Inbox, with the buyer, budget and source for every offer (${index + 1})`,
          supporting: [
            'Each deal shows the buyer, the budget and where it came from.',
            'Reply from the same thread without leaving the Inbox.',
          ],
        },
      ])
    ),
    technicalReleases: [
      { version: '26.8.1', date: '2026-08-16' },
      { version: '26.7.0', date: '2026-07-21' },
    ],
  },
};

/** Right-to-left: an Arabic post in an Arabic document. */
export const RtlArabicArchive: Story = {
  args: {
    months: [
      month('2026-08', 'أغسطس 2026', [
        {
          ...ENTRY,
          title: 'راجع صفقات العلامات التجارية في صندوق الوارد',
          explanation: 'شاهد المشتري والميزانية والمصدر.',
        },
      ]),
    ],
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
