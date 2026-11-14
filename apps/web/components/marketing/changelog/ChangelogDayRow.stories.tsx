import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  type CustomerChangelogEntry,
  groupCustomerChangelogByDay,
} from '@/lib/customer-changelog';
import { ChangelogDayRow } from './ChangelogDayRow';
import '@/app/(marketing)/changelog/changelog-day-row.css';

const LEAD: CustomerChangelogEntry = {
  id: 'customer-update:release-previews',
  aliases: [],
  title: 'Play release previews right on a profile',
  slug: 'play-release-previews',
  date: '2026-11-03',
  summary: 'Fans can hear a release without leaving the page.',
  category: 'new',
  capabilities: [],
  surfaces: [],
  availability: 'ga',
  media: null,
  technicalVersion: '2026-11-03',
  explanation: 'Fans can hear a release without leaving the page.',
  supporting: [],
  action: null,
  technical: [],
  prominence: 'featured',
};

function fix(index: number, title: string, explanation: string) {
  return {
    ...LEAD,
    id: `customer-update:fix-${index}`,
    slug: `fix-${index}`,
    title,
    explanation,
    category: 'fixed' as const,
    prominence: 'small' as const,
  };
}

const FIXES = [
  fix(
    1,
    'Send stays visible with larger text',
    'The composer keeps its actions in view at every text size.'
  ),
  fix(
    2,
    'Even spacing around the Mac app window',
    'The window gutters now match on every side.'
  ),
];

const meta = {
  title: 'Marketing/Fixtures/ChangelogDayRow',
  component: ChangelogDayRow,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'One day of the public changelog feed: the date on a sticky rail beside the day’s posts (category chip, headline permalink, lead, optional 16:9 media, bullets, availability chip, next step), with the same-day fixes folded into one Fixes and polish list.',
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
} satisfies Meta<typeof ChangelogDayRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PostWithFixes: Story = {
  args: { day: groupCustomerChangelogByDay([LEAD, ...FIXES])[0] },
};

export const LimitedWithNextStep: Story = {
  args: {
    day: groupCustomerChangelogByDay([
      {
        ...LEAD,
        availability: 'limited',
        prerequisites: ['Profiles with a connected catalog'],
        supporting: [
          'Previews start from the release card.',
          'Playback pauses when another preview starts.',
        ],
        action: { label: 'See a demo profile', href: '/demo' },
      },
    ])[0],
  },
};

export const FixesOnly: Story = {
  args: { day: groupCustomerChangelogByDay(FIXES)[0] },
};
