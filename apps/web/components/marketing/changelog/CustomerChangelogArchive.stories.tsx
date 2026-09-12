import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CustomerChangelogMonthGroup } from '@/lib/customer-changelog';
import { CustomerChangelogArchive } from './CustomerChangelogArchive';

const BOUNDED_MONTHS: readonly CustomerChangelogMonthGroup[] = [
  {
    monthKey: '2026-08',
    label: 'August 2026',
    entries: [
      {
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
          'Deterministic, static reduced-motion state for the customer-outcome changelog archive (JOV-6203 Wave 1). Two neutral month groups bound the entry count and story height; the production route remains the source of the hero and signup, so ChangelogEmailSignup and Turnstile are intentionally absent.',
      },
    },
  },
  decorators: [
    Story => (
      <section className='min-h-screen bg-page py-16 text-primary-token'>
        <div className='mx-auto max-w-3xl px-6'>
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

export const Empty: Story = {
  args: { months: [] },
};
