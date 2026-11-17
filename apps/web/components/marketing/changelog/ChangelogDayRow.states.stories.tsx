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

const meta = {
  title: 'Marketing/Fixtures/ChangelogDayRow States',
  component: ChangelogDayRow,
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
  args: { day: groupCustomerChangelogByDay([LEAD])[0] },
} satisfies Meta<typeof ChangelogDayRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a day with no posts or fixes keeps its rail and an empty body. */
export const EmptyDay: Story = {
  args: { day: { date: '2026-11-03', posts: [], polish: [] } },
};

/** Partial: a post with only its headline: no lead, bullets or next step. */
export const PartialHeadlineOnly: Story = {
  args: {
    day: groupCustomerChangelogByDay([
      { ...LEAD, explanation: '', summary: '' },
    ])[0],
  },
};

/** Long content: a long headline, long lead, many bullets and fixes. */
export const LongContentDay: Story = {
  args: {
    day: groupCustomerChangelogByDay([
      {
        ...LEAD,
        title:
          'Play release previews right on a profile, from every release card, with playback that pauses when another preview starts',
        explanation: `${LEAD.explanation} Previews start from the release card and keep playing while a fan scrolls the rest of the profile.`,
        supporting: Array.from(
          { length: 6 },
          (_, index) =>
            `Preview detail ${index + 1}: playback stays in step with the release card and its listen links.`
        ),
      },
      ...Array.from({ length: 5 }, (_, index) => ({
        ...LEAD,
        id: `customer-update:long-fix-${index}`,
        slug: `long-fix-${index}`,
        title: `Fix ${index + 1}: long labels wrap instead of clipping at narrow widths`,
        explanation: 'The layout keeps every label readable at every size.',
        category: 'fixed' as const,
        prominence: 'small' as const,
      })),
    ])[0],
  },
};

/** Right-to-left: an Arabic post in an Arabic document. */
export const RtlArabicDay: Story = {
  args: {
    day: groupCustomerChangelogByDay([
      {
        ...LEAD,
        title: 'شغّل معاينات الإصدار مباشرة من الملف',
        explanation: 'يمكن للمعجبين سماع الإصدار دون مغادرة الصفحة.',
        supporting: ['تبدأ المعاينة من بطاقة الإصدار.'],
      },
    ])[0],
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
