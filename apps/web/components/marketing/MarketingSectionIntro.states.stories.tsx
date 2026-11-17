import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSectionIntro } from './MarketingSectionIntro';

/** Rendered states of the section intro; defaults live in MarketingSectionIntro.stories.tsx. */
const meta = {
  title: 'Marketing/Primitives/MarketingSectionIntro States',
  component: MarketingSectionIntro,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base px-6 py-16 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    eyebrow: 'Inside Jovie',
    title: 'Your release work, connected.',
    description: 'A shared view of releases, profiles, and fan activity.',
  },
} satisfies Meta<typeof MarketingSectionIntro>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an empty badge list renders no badge row at all. */
export const EmptyBadges: Story = {
  args: { badges: [] },
};

/** Partial: badges but no aside, title id or custom classes. */
export const PartialBadgesNoAside: Story = {
  args: { badges: [{ label: 'Presaves' }, { label: 'Fan capture' }] },
};

/** Long content: a title past the two-line clamp, long copy and many badges. */
export const LongContentClampedTitle: Story = {
  args: {
    eyebrow: 'The platform for every release, profile and fan signal',
    title:
      'One profile for every fan, every release, every show and every follow-up you will ever need to send',
    titleId: 'marketing-section-intro-long',
    description:
      'Show the next useful release, link, show or action without bolting on a separate stack, and keep every surface in step with the catalog as dates move.',
    badges: [
      { label: 'Presaves' },
      { label: 'Release day' },
      { label: 'Fan capture' },
      { label: 'Tour dates' },
      { label: 'Smart links for every service' },
    ],
  },
};

/** Right-to-left: Arabic intro copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    eyebrow: 'داخل جوفي',
    title: 'عملك على الإصدار، متصل.',
    description: 'عرض مشترك للإصدارات والملفات ونشاط المعجبين.',
    badges: [{ label: 'الحفظ المسبق' }],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
