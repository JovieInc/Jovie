import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ChatActionCard } from '../types';
import { ChatStarterActionsRail } from './ChatStarterActionsRail';

const longCards: ChatActionCard[] = [
  {
    id: 'plan-release',
    title:
      'Plan the full rollout for your next single, from the first teaser to release week',
    body: 'Lay out every date, asset and pitch the release needs, then keep the whole plan in step as dates move and new opportunities come in from your fans and curators.',
    actionLabel: 'Start Planning the Rollout',
    prompt: 'Plan my next single.',
  },
  {
    id: 'review-signals',
    title: 'Review Signals',
    body: 'Review momentum across every service.',
    actionLabel: 'Review Signals',
    prompt: 'Review my signals.',
  },
  {
    id: 'generate-album-art',
    title: 'Generate Art',
    body: 'Create a cover direction.',
    actionLabel: 'Generate Art',
    prompt: 'Create cover art.',
  },
  {
    id: 'build-artist-profile',
    title: 'Build Your Profile',
    body: 'Fill in your bio and links.',
    actionLabel: 'Build Profile',
    prompt: 'Build my profile.',
  },
];

const rtlCards: ChatActionCard[] = [
  {
    id: 'plan-release',
    title: 'خطط لإصدارك',
    body: 'ضع خطة لكل موعد وكل أصل يحتاجه الإصدار.',
    actionLabel: 'ابدأ التخطيط',
    prompt: 'خطط لإصداري.',
  },
  {
    id: 'review-signals',
    title: 'راجع المؤشرات',
    body: 'راجع الزخم عبر كل خدمة.',
    actionLabel: 'راجع',
    prompt: 'راجع مؤشراتي.',
  },
];

const meta = {
  title: 'Jovie/Components/ChatStarterActionsRail States',
  component: ChatStarterActionsRail,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <div className='mx-auto w-full max-w-xl px-12 py-4'>
        <Story />
      </div>
    ),
  ],
  args: { cards: longCards, onAct: fn(), onDismiss: fn() },
} satisfies Meta<typeof ChatStarterActionsRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a wrapping title, body and action label, four starters. */
export const LongContentStarter: Story = {};

/** Right-to-left: Arabic starters in an Arabic document direction. */
export const RtlArabic: Story = {
  args: { cards: rtlCards },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
