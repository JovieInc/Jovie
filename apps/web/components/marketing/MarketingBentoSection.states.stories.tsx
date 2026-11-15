import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingBentoSection } from './MarketingBentoSection';

function Preview({ label }: { readonly label: string }) {
  return (
    <div className='grid h-full place-items-center p-5' aria-hidden='true'>
      <div className='w-full max-w-64 rounded-lg border border-subtle bg-surface-1 p-4 text-xs font-semibold text-primary-token shadow-card'>
        {label}
      </div>
    </div>
  );
}

const meta = {
  title: 'Marketing/Sections/MarketingBentoSection States',
  component: MarketingBentoSection,
  parameters: { layout: 'fullscreen' },
  args: {
    eyebrow: 'Inside Jovie',
    title: 'Your release work, connected.',
    titleId: 'bento-states-title',
    description: 'Release plans, profiles and fan activity in one place.',
    featuredStart: {
      id: 'release-plan',
      title: 'Know what ships next',
      body: 'Every date and asset in one plan.',
    },
    supportingTop: {
      id: 'profile',
      title: 'One profile for every fan',
      body: 'Your latest release leads.',
    },
    supportingBottom: {
      id: 'signals',
      title: 'Signals worth acting on',
      body: 'See what moved this week.',
    },
    featuredEnd: {
      id: 'fans',
      title: 'Keep every fan close',
      body: 'Updates go to the people who asked.',
    },
  },
  decorators: [
    Story => (
      <div className='bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingBentoSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: all four slots with copy only, no previews and no actions. */
export const PartialCopyOnly: Story = {};

/** Long content: wrapping titles and bodies, with previews and actions. */
export const LongContentCards: Story = {
  args: {
    title:
      'Your release work, your profile and every fan signal, connected in one place',
    featuredStart: {
      id: 'release-plan',
      title:
        'Know exactly what ships next, and what is still missing before release day',
      body: 'Every date, asset, credit and pitch lives in one plan that keeps itself in step as dates move, so nothing slips between the distributor, the profile and the promo calendar.',
      preview: <Preview label='Midnight Drive · Ready' />,
      previewLabel: 'Release plan preview',
      action: { href: '/start', label: 'Plan a release' },
    },
    supportingTop: {
      id: 'profile',
      title: 'One profile for every fan, on every service and every screen',
      body: 'Your latest release leads and the rest stays one tap away.',
    },
    supportingBottom: {
      id: 'signals',
      title: 'Signals worth acting on',
      body: 'See which cities, playlists and sources moved this week, and what to do about each of them before the window closes.',
    },
    featuredEnd: {
      id: 'fans',
      title: 'Keep every fan close',
      body: 'Updates go only to the people who asked for them.',
      preview: <Preview label='New York · Release page' />,
      previewLabel: 'Fan activity preview',
      previewAspect: 'square',
      action: { href: '/artist-profiles', label: 'Explore profiles' },
    },
  },
};

/** Right-to-left: Arabic section and card copy in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    eyebrow: 'داخل جوفي',
    title: 'عمل إصدارك، متصل.',
    description: 'خطط الإصدار والصفحات ونشاط المعجبين في مكان واحد.',
    featuredStart: {
      id: 'release-plan',
      title: 'اعرف ما سيصدر تاليًا',
      body: 'كل موعد وكل أصل في خطة واحدة.',
      action: { href: '/start', label: 'خطط' },
    },
    supportingTop: {
      id: 'profile',
      title: 'صفحة واحدة',
      body: 'أحدث إصدار أولًا.',
    },
    supportingBottom: {
      id: 'signals',
      title: 'مؤشرات',
      body: 'ما تغير هذا الأسبوع.',
    },
    featuredEnd: {
      id: 'fans',
      title: 'المعجبون',
      body: 'التحديثات لمن طلبها.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
