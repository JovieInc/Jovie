import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Eye } from 'lucide-react';
import { expect } from 'storybook/test';
import { ContentMetricCard } from './ContentMetricCard';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';

const meta = {
  title: 'Molecules/ContentMetricCard',
  component: ContentMetricCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-56 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Total streams',
    value: '128.4k',
  },
} satisfies Meta<typeof ContentMetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: Eye,
  },
};

export const WithSubtitle: Story = {
  args: {
    subtitle: '+4.2% vs last week',
  },
};

export const WithHeaderRight: Story = {
  args: {
    icon: Eye,
    subtitle: 'Last 28 days',
    headerRight: <span className='text-2xs text-tertiary-token'>Live</span>,
  },
};

/** Match every default placeholder line box to its loaded counterpart. */
export const DefaultLoadingAndLoaded: Story = {
  render: args => (
    <div className='space-y-4'>
      {[false, true].flatMap(showIcon =>
        [false, true].map(showSubtitle => (
          <div
            key={`${showIcon}-${showSubtitle}`}
            data-metric-geometry
            className='space-y-3'
          >
            <div data-metric-state='loading'>
              <ContentMetricCardSkeleton
                showIcon={showIcon}
                showSubtitle={showSubtitle}
              />
            </div>
            <div data-metric-state='loaded'>
              <ContentMetricCard
                {...args}
                icon={showIcon ? Eye : undefined}
                subtitle={showSubtitle ? 'Last 28 days' : undefined}
              />
            </div>
          </div>
        ))
      )}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready;
    for (const pair of canvasElement.querySelectorAll(
      '[data-metric-geometry]'
    )) {
      const loading = pair.querySelector('[data-metric-state="loading"] > *');
      const loaded = pair.querySelector('[data-metric-state="loaded"] > *');
      if (!loading || !loaded) throw new Error('Missing metric geometry pair');
      const loadingBox = loading.getBoundingClientRect();
      const loadedBox = loaded.getBoundingClientRect();
      await expect(loadingBox.height).toBeCloseTo(loadedBox.height, 3);
      await expect(loadingBox.width).toBeCloseTo(loadedBox.width, 3);
      const loadingLabel = Array.from(
        loading.firstElementChild?.firstElementChild?.querySelectorAll(
          '[data-slot="skeleton"]'
        ) ?? []
      ).at(-1);
      const loadedLabel = loaded.querySelector('p');
      if (!loadingLabel || !loadedLabel)
        throw new Error('Missing metric label');
      const beforeLabel = loadingLabel.getBoundingClientRect();
      const afterLabel = loadedLabel.getBoundingClientRect();
      await expect(beforeLabel.x - loadingBox.x).toBeCloseTo(
        afterLabel.x - loadedBox.x,
        3
      );
      await expect(beforeLabel.y - loadingBox.y).toBeCloseTo(
        afterLabel.y - loadedBox.y,
        3
      );
      await expect(beforeLabel.height).toBeCloseTo(afterLabel.height, 3);
      const loadingSlots = loading.firstElementChild?.children;
      const loadedSlots = loaded.firstElementChild?.children;
      if (!loadingSlots || !loadedSlots)
        throw new Error('Missing metric slots');
      await expect(loadingSlots.length).toBe(loadedSlots.length);
      for (let index = 0; index < loadedSlots.length; index += 1) {
        const before = loadingSlots[index].getBoundingClientRect();
        const after = loadedSlots[index].getBoundingClientRect();
        await expect(before.x - loadingBox.x).toBeCloseTo(
          after.x - loadedBox.x,
          3
        );
        await expect(before.y - loadingBox.y).toBeCloseTo(
          after.y - loadedBox.y,
          3
        );
        await expect(before.height).toBeCloseTo(after.height, 3);
      }
    }
  },
};

export const IconChip: Story = {
  args: {
    layout: 'icon-chip',
    label: 'QR Scans',
    value: '1.2k',
    subtitle: 'Fans who scanned your QR',
    icon: Eye,
    tone: 'success',
  },
};

export const CompactIconChip: Story = {
  args: {
    layout: 'icon-chip',
    density: 'compact',
    label: 'Total Revenue',
    value: '$123.45',
    icon: Eye,
    tone: 'success',
  },
};

export const IconChipLoadingAndLoaded: Story = {
  render: args => (
    <div className='space-y-3'>
      {(
        [
          {
            layout: 'icon-chip',
            density: 'default',
            subtitle: 'Recent visits',
          },
          { layout: 'icon-chip', density: 'compact', subtitle: undefined },
          {
            layout: 'icon-chip-inline',
            density: 'default',
            subtitle: undefined,
          },
        ] as const
      ).map(({ layout, density, subtitle }) => (
        <div key={`${layout}-${density}`} className='space-y-3'>
          <div data-testid={`${layout}-${density}-loading`}>
            <ContentMetricCardSkeleton
              layout={layout}
              density={density}
              showSubtitle={Boolean(subtitle)}
            />
          </div>
          <div data-testid={`${layout}-${density}-loaded`}>
            <ContentMetricCard
              {...args}
              layout={layout}
              density={density}
              subtitle={subtitle}
              icon={Eye}
            />
          </div>
        </div>
      ))}
    </div>
  ),
};

export const InlineIconChip: Story = {
  args: {
    layout: 'icon-chip-inline',
    label: 'Waitlisted',
    value: '1,234',
    icon: Eye,
    tone: 'accent',
  },
};

export const LongInlineLabel: Story = {
  args: {
    ...InlineIconChip.args,
    label: 'Waitlisted creators awaiting an invitation',
  },
};
