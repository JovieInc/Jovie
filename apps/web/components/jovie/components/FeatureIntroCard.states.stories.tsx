import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { APP_ROUTES } from '@/constants/routes';
import type { FeatureIntroKind } from '../feature-intro-contract';
import { FeatureIntroCard, FeatureIntroHost } from './FeatureIntroCard';

const meta = {
  title: 'Jovie/FeatureIntroCard States',
  component: FeatureIntroCard,
  parameters: { layout: 'centered', nextjs: { appDirectory: true } },
  decorators: [
    Story => (
      <div className='w-90 max-w-full p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    changelogHref: APP_ROUTES.CHANGELOG,
    onDismiss: fn(),
    onPrimaryCTA: fn(),
    presentation: {
      kind: 'highlight',
      highlight: {
        id: 'catalog-in-chat',
        title: 'Your Catalog Is Already In Chat',
        oneLine: 'Ask about a release, a show, or the next move.',
        ctaTitle: 'Ask Something',
      },
    },
  },
} satisfies Meta<typeof FeatureIntroCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the host has no highlight and no new items, so nothing renders. */
export const EmptyNothingToIntroduce: Story = {
  render: args => (
    <FeatureIntroHost
      catalog={{ highlight: null, whatsNewID: 'empty', whatsNewItems: [] }}
      changelogHref={args.changelogHref}
      onHighlightCTA={args.onPrimaryCTA}
    />
  ),
};

/** Partial: one new item and no And more link. */
export const PartialSingleBullet: Story = {
  args: {
    presentation: {
      kind: 'whatsNew',
      id: 'changelog:partial',
      rows: [
        {
          kind: 'bullet',
          bullet: {
            id: 'partial:0',
            text: 'Profile actions stay truthful and usable.',
            accent: 'accent',
          },
        },
      ],
    } satisfies FeatureIntroKind,
  },
};

/** Long content: a wrapping highlight title, line and call to action. */
export const LongContentHighlight: Story = {
  args: {
    presentation: {
      kind: 'highlight',
      highlight: {
        id: 'long',
        title:
          'Your Whole Catalog, Every Show and Every Fan Signal Is Already In Chat',
        oneLine:
          'Ask about a release, a show, the next move, or what changed since last week, and Jovie answers from your own data.',
        ctaTitle: 'Ask Something About Your Catalog',
      },
    } satisfies FeatureIntroKind,
  },
};

/** Long content in what's new mode: wrapping bullets and the And more link. */
export const LongContentWhatsNew: Story = {
  args: {
    presentation: {
      kind: 'whatsNew',
      id: 'changelog:long',
      rows: [
        {
          kind: 'bullet',
          bullet: {
            id: 'long:0',
            text: 'Profile actions stay truthful and usable on every screen size, including the smallest phones.',
            accent: 'accent',
          },
        },
        {
          kind: 'bullet',
          bullet: {
            id: 'long:1',
            text: 'Work, calendar and inbox stay together, so a release plan never drifts from its dates.',
            accent: 'orange',
          },
        },
        { kind: 'andMore' },
      ],
    } satisfies FeatureIntroKind,
  },
};

/** Right-to-left: Arabic highlight copy in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    presentation: {
      kind: 'highlight',
      highlight: {
        id: 'rtl',
        title: 'كتالوجك موجود في المحادثة',
        oneLine: 'اسأل عن إصدار أو عرض أو الخطوة التالية.',
        ctaTitle: 'اسأل',
      },
    } satisfies FeatureIntroKind,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
