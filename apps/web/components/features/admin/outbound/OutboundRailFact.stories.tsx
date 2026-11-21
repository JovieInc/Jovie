import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn, userEvent, within } from 'storybook/test';
import { OutboundRailFact } from './OutboundRailFact';

const meta = {
  title: 'Admin/Outbound/Rail fact',
  component: OutboundRailFact,
  args: {
    active: false,
    pending: false,
    onDecision: fn(async () => {}),
    item: {
      key: 'canonical:display-name',
      revision: 'synthetic-revision',
      category: 'identity',
      label: 'Display name',
      value: 'Ada | Instagram, Spotify',
      url: 'https://example.com/ada',
      source: 'public link page',
      observedAt: '2026-10-01T00:00:00Z',
      confidence: 0.8,
      rationale: 'Name observed on the linked page.',
      freshness: 'fresh',
      decision: null,
    },
  },
} satisfies Meta<typeof OutboundRailFact>;
export default meta;
export const RecordedName: StoryObj<typeof meta> = {};

export const UnknownSource: StoryObj<typeof meta> = {
  args: {
    item: {
      ...meta.args.item,
      source: '',
      observedAt: null,
      url: null,
      rationale: '',
    },
  },
};

export const LoadingDecisionPending: StoryObj<typeof meta> = {
  args: { pending: true },
};

export const EmptyNoValueRecorded: StoryObj<typeof meta> = {
  args: { item: { ...meta.args.item, value: '' } },
};

export const ErrorMissingCorrection: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Save Correction' })
    );
  },
};

export const LongContentName: StoryObj<typeof meta> = {
  args: {
    item: {
      ...meta.args.item,
      value:
        'Ada and the Midnight Orchestra | Instagram, Spotify, YouTube, Live Tickets and Official Merch',
      rationale:
        'Name observed on the linked page alongside a long list of destinations and a very long rationale that must wrap.',
    },
  },
};

export const RtlName: StoryObj<typeof meta> = {
  args: {
    item: {
      ...meta.args.item,
      label: 'الاسم',
      value: 'عدا | إنستغرام، سبوتيفاي',
      rationale: 'الاسم ظاهر في الصفحة المرتبطة.',
    },
  },
};
