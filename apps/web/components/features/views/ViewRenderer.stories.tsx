import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ViewSpec } from '@/lib/views/spec';
import { ViewRenderer } from './ViewRenderer';

export const SAMPLE_VIEW_SPEC = {
  schema: 'jovie.view.v1',
  title: 'Weekly snapshot',
  description: 'Streams and fan growth for the last 30 days.',
  blocks: [
    { type: 'stat', label: 'Streams', value: '12,408', hint: 'Last 30 days' },
    { type: 'stat', label: 'New fans', value: '312' },
    { type: 'stat', label: 'Link clicks', value: '1,904' },
    {
      type: 'sparkline',
      label: 'Daily streams',
      points: [12, 14, 13, 18, 22, 21, 27, 31],
      polarity: 'higher-is-better',
    },
    {
      type: 'table',
      columns: [
        { key: 'city', label: 'City' },
        { key: 'fans', label: 'Fans' },
      ],
      rows: [
        { city: 'Los Angeles', fans: 120 },
        { city: 'Berlin', fans: 88 },
        { city: 'Tokyo', fans: null },
      ],
    },
    { type: 'text', body: 'Plain text notes render as text, never HTML.' },
    {
      type: 'html',
      html: '<p style="font-family:sans-serif">Sandboxed HTML</p>',
      height: 160,
    },
  ],
} satisfies ViewSpec;

const meta = {
  title: 'Features/Views/ViewRenderer',
  component: ViewRenderer,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spec: SAMPLE_VIEW_SPEC },
} satisfies Meta<typeof ViewRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const StatsOnly: Story = {
  args: {
    spec: {
      schema: 'jovie.view.v1',
      title: 'Stats',
      blocks: SAMPLE_VIEW_SPEC.blocks.slice(0, 3),
    },
  },
};
