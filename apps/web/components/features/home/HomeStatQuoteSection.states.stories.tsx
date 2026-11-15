import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeStatQuoteSection } from './HomeStatQuoteSection';

/** Rendered states of the home stat pull-quote. */
const meta = {
  title: 'Features/Home/HomeStatQuoteSection/States',
  component: HomeStatQuoteSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomeStatQuoteSection>;

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the stat and source with no supporting line. */
export const PartialStatOnly: Story = {
  args: { stat: '3x', body: '', source: 'Pilot cohort' },
};

/** Long content: a long supporting line and source that wrap. */
export const LongContentWrappingCopy: Story = {
  args: {
    stat: '2.9x',
    body: 'faster releases that compound into more fans, more saves, more pre-saves and more listeners on every service the release reaches.',
    source:
      'Indie release benchmark across every distributor and every release window, 2026',
  },
};

/** Right-to-left: Arabic copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    stat: '2.9x',
    body: 'إصدارات أسرع تتراكم لتجلب معجبين أكثر.',
    source: 'معيار الإصدارات المستقلة، 2026',
  },
  decorators: [withRtlDocument],
};
