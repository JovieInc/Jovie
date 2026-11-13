import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CustomerChangelogMonthGroup } from '@/lib/customer-changelog';
import { CustomerChangelogArchive } from './CustomerChangelogArchive';
import '@/app/(marketing)/changelog/changelog-day-row.css';
import '@/app/(marketing)/changelog/changelog-editorial.css';

const BOUNDED_MONTHS: readonly CustomerChangelogMonthGroup[] = [
  {
    monthKey: '2026-08',
    label: 'August 2026',
    entries: [
      {
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
      },
    ],
  },
  {
    monthKey: '2026-07',
    label: 'July 2026',
    entries: [
      {
        id: 'customer-update:sign-out',
        aliases: [],
        title: 'Sign-out stays available when the store is missing',
        slug: 'sign-out-stays-available-v26-7-0-0',
        date: '2026-07-21',
        summary: 'Customer sessions can still leave.',
        category: 'fixed',
        capabilities: [],
        surfaces: [],
        availability: 'ga',
        media: null,
        technicalVersion: '26.7.0',
        explanation: 'Customer sessions can still leave.',
        supporting: [],
        action: null,
        technical: ['JOV-5260', 'Redis', 'admission'],
        prominence: 'small',
      },
    ],
  },
];

const meta = {
  title: 'Marketing/Fixtures/CustomerChangelogArchive',
  component: CustomerChangelogArchive,
  parameters: {
    layout: 'fullscreen',
    chromatic: { pauseAnimationAtEnd: true },
    docs: {
      description: {
        component:
          'Deterministic, static reduced-motion state for the public changelog feed: day posts newest first with a sticky date rail and a reading column. Each day leads with its outcome posts (headline, lead, at most one approved media frame, availability chip, next step) and folds the same-day fixes into one quiet Fixes and polish list. The production route owns the page header and signup, so ChangelogEmailSignup and Turnstile are intentionally absent.',
      },
    },
  },
  decorators: [
    Story => (
      <section className='min-h-screen bg-page py-16 text-primary-token'>
        <div className='mx-auto w-full max-w-public-content px-6 sm:px-8 lg:px-10'>
          <Story />
        </div>
      </section>
    ),
  ],
  args: {
    months: BOUNDED_MONTHS,
  },
} satisfies Meta<typeof CustomerChangelogArchive>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BoundedArchive: Story = {
  name: 'bounded month archive',
};

export const WithMedia: Story = {
  name: 'entry with approved media',
  args: {
    months: [
      {
        ...BOUNDED_MONTHS[0],
        entries: [
          {
            ...BOUNDED_MONTHS[0].entries[0],
            media: {
              kind: 'image',
              src: '/images/auth/noir-studio.webp',
              alt: 'Jovie Inbox showing a qualified brand deal',
            },
          },
          BOUNDED_MONTHS[1].entries[0],
        ],
      },
    ],
  },
};

const DAY_LEAD = BOUNDED_MONTHS[0].entries[0];

export const DayWithFixesAndPolish: Story = {
  name: 'day post with fixes and polish',
  args: {
    months: [
      {
        ...BOUNDED_MONTHS[0],
        entries: [
          {
            ...DAY_LEAD,
            availability: 'limited',
            prerequisites: ['Available on eligible profiles'],
            supporting: [
              'Each deal shows the buyer and the budget.',
              'Reply from the same thread.',
            ],
            action: { label: 'Try It', href: '/pricing' },
          },
          {
            ...DAY_LEAD,
            id: 'customer-update:fix-one',
            slug: 'update-fix-one',
            title: 'Send stays visible with larger text',
            explanation:
              'The message composer keeps Send fully visible when you enlarge page text.',
            category: 'fixed',
          },
          {
            ...DAY_LEAD,
            id: 'customer-update:fix-two',
            slug: 'update-fix-two',
            title: 'Pricing comparisons read cleanly on phones',
            explanation:
              'Plan names and feature descriptions no longer clip on small screens.',
            category: 'fixed',
          },
        ],
      },
    ],
  },
};

export const Empty: Story = {
  args: { months: [] },
};
