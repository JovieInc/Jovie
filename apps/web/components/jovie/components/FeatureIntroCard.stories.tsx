import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import type { FeatureIntroKind } from '../feature-intro-contract';
import { FeatureIntroCard } from './FeatureIntroCard';

const highlightPresentation = {
  kind: 'highlight',
  highlight: {
    id: 'catalog-in-chat',
    title: 'Your Catalog Is Already In Chat',
    oneLine: 'Ask about a release, a show, or the next move.',
    ctaTitle: 'Ask Something',
  },
} satisfies FeatureIntroKind;

const whatsNewPresentation = {
  kind: 'whatsNew',
  id: 'changelog:26.8.1',
  rows: [
    {
      kind: 'bullet',
      bullet: {
        id: '26.8.1:featured:0',
        text: 'Profile actions stay truthful and usable.',
        accent: 'accent',
      },
    },
    {
      kind: 'bullet',
      bullet: {
        id: '26.8.1:added:1',
        text: 'Library, calendar, and inbox stay together.',
        accent: 'blue',
      },
    },
    { kind: 'andMore' },
  ],
} satisfies FeatureIntroKind;

const meta = {
  title: 'Jovie/FeatureIntroCard',
  component: FeatureIntroCard,
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [
    Story => (
      <div className='w-[360px] max-w-full p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    changelogHref: APP_ROUTES.CHANGELOG,
    onDismiss: () => undefined,
    onPrimaryCTA: () => undefined,
  },
} satisfies Meta<typeof FeatureIntroCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Highlight: Story = {
  args: {
    presentation: highlightPresentation,
  },
};

export const WhatsNew: Story = {
  args: {
    presentation: whatsNewPresentation,
  },
};
