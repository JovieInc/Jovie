import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import type { ChangelogRelease } from '@/lib/changelog-parser';
import { ChangelogTimeline } from './ChangelogTimeline';
import '@/app/(marketing)/changelog/changelog-editorial.css';

const RELEASE: ChangelogRelease = {
  version: '26.7.0',
  kind: 'release',
  date: '2026-07-21',
  summary: 'A focused set of **public-facing** workflow improvements.',
  sections: {
    featured: [],
    added: ['**Release workspace:** keeps status and links together.'],
    changed: ['Profile cards share one `responsive` spacing contract.'],
    fixed: ['Compact layouts keep their labels visible.'],
    removed: [],
  },
};

/** Thirty releases: more than the first page, so the list discloses more. */
const MANY_RELEASES: readonly ChangelogRelease[] = Array.from(
  { length: 30 },
  (_, index) => ({
    ...RELEASE,
    version: `26.${30 - index}.0`,
    date: `2026-07-${String(30 - index).padStart(2, '0')}`,
    summary: `Release ${30 - index}: reliability and accessibility refinements.`,
  })
);

const meta = {
  title: 'Marketing/Fixtures/ChangelogTimeline States',
  component: ChangelogTimeline,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithChangelogPage(Story) {
      return (
        <section className='min-h-screen bg-base py-16 text-primary-token'>
          <MarketingContainer width='page'>
            <div className='border-t border-subtle pt-14'>
              <Story />
            </div>
          </MarketingContainer>
        </section>
      );
    },
  ],
  args: { releases: [RELEASE] },
} satisfies Meta<typeof ChangelogTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: an undated release with no summary and a single section. */
export const PartialUndatedRelease: Story = {
  args: {
    releases: [
      {
        ...RELEASE,
        date: '',
        summary: '',
        sections: {
          featured: [],
          added: [],
          changed: [],
          fixed: ['Compact layouts keep their labels visible.'],
          removed: [],
        },
      },
    ],
  },
};

/** Long content: thirty releases, so a Show More control reveals the rest. */
export const LongContentManyReleases: Story = {
  args: { releases: MANY_RELEASES },
};

/** Long content: a long summary and many long bullets in one release. */
export const LongContentBullets: Story = {
  args: {
    releases: [
      {
        ...RELEASE,
        summary:
          'A focused set of **public-facing** workflow improvements across profiles, release pages, pitches and every connected service, with fixes for narrow layouts.',
        sections: {
          ...RELEASE.sections,
          added: Array.from(
            { length: 6 },
            (_, index) =>
              `**Release workspace ${index + 1}:** keeps status, links, assets and every pitch together in one place, even for long release titles.`
          ),
        },
      },
    ],
  },
};

/** Right-to-left: an Arabic release summary and bullets in an Arabic document. */
export const RtlArabicRelease: Story = {
  args: {
    releases: [
      {
        ...RELEASE,
        summary: 'مجموعة من التحسينات على سير العمل.',
        sections: {
          ...RELEASE.sections,
          added: ['**مساحة الإصدار:** تجمع الحالة والروابط معاً.'],
        },
      },
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
