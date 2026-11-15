import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { HOMEPAGE_MEDIA_MAP } from '@/data/homepageMediaMap';
import {
  HomepageCertifiedSections,
  HomepageEditorialFeatureSection,
} from './HomepageCertifiedSections';

// Same real public-profile exports the live homepage mounts.
const previews = {
  subscribe: HOMEPAGE_MEDIA_MAP.relationships.asset,
  pay: HOMEPAGE_MEDIA_MAP.pay.asset,
} as const;
const section = HOMEPAGE_LAUNCH_COPY.certified.sections[0];

const meta = {
  title: 'Marketing/HomepageCertifiedSections States',
  component: HomepageCertifiedSections,
  parameters: { layout: 'fullscreen' },
  args: { previews },
} satisfies Meta<typeof HomepageCertifiedSections>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one real export with no caption, as a page record may supply. */
export const PartialSingleExportNoCaption: Story = {
  render: () => (
    <HomepageEditorialFeatureSection
      previews={[{ image: previews.subscribe }]}
      section={{
        id: 'partial-single',
        headline: section.headline,
        body: section.body,
      }}
    />
  ),
};

/** Long content: a headline and body far past the editorial copy length. */
export const LongContentEditorialCopy: Story = {
  render: () => (
    <HomepageEditorialFeatureSection
      previews={[
        { image: previews.subscribe, caption: 'Get updates' },
        { image: previews.pay, caption: 'Pay what you want, any time' },
      ]}
      section={{
        id: 'long-content',
        headline:
          'Turn attention into relationships that last past release day, the tour and the next record.',
        body: 'Every visitor who finds your profile can ask for updates or pay you directly, and every one of them stays yours to reach the next time you have something to share, without a second tool, a second list or a second login to keep in step.',
      }}
    />
  ),
};

/** Right-to-left: Arabic section copy in an Arabic document direction. */
export const RtlArabic: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <HomepageEditorialFeatureSection
        previews={[
          { image: previews.subscribe, caption: 'احصل على التحديثات' },
          { image: previews.pay, caption: 'ادفع' },
        ]}
        section={{
          id: 'rtl',
          headline: 'حوّل الانتباه إلى علاقات.',
          body: 'كل زائر لصفحتك يمكنه طلب التحديثات أو الدفع لك مباشرة.',
        }}
      />
    </div>
  ),
};
