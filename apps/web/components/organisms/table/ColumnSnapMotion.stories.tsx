import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { td as MotionCell, th as MotionHeader } from 'motion/react-m';
import { useState } from 'react';
import { ColumnSnapMotion } from './ColumnSnapMotion';

interface ExampleCopy {
  readonly show: string;
  readonly hide: string;
  readonly release: string;
  readonly streams: string;
  readonly status: string;
  readonly title: string;
  readonly count: string;
  readonly state: string;
}

const ENGLISH: ExampleCopy = {
  show: 'Show streams',
  hide: 'Hide streams',
  release: 'Release',
  streams: 'Streams',
  status: 'Status',
  title: 'First light',
  count: '1,240',
  state: 'Released',
};

function ColumnExample({
  enabled,
  copy = ENGLISH,
  dir,
}: {
  readonly enabled: boolean;
  readonly copy?: ExampleCopy;
  readonly dir?: 'rtl';
}) {
  const [showStreams, setShowStreams] = useState(false);
  const Header = enabled ? MotionHeader : 'th';
  const Cell = enabled ? MotionCell : 'td';
  const motionProps = enabled
    ? { layout: 'position' as const, transition: { duration: 0.15 } }
    : {};
  return (
    <div
      dir={dir}
      lang={dir === 'rtl' ? 'ar' : undefined}
      className='flex w-80 flex-col gap-4'
    >
      <Button onClick={() => setShowStreams(value => !value)}>
        {showStreams ? copy.hide : copy.show}
      </Button>
      <ColumnSnapMotion enabled={enabled}>
        <table className='w-full text-start text-sm'>
          <thead>
            <tr>
              <Header {...motionProps}>{copy.release}</Header>
              {showStreams && <Header {...motionProps}>{copy.streams}</Header>}
              <Header {...motionProps}>{copy.status}</Header>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Cell {...motionProps}>{copy.title}</Cell>
              {showStreams && <Cell {...motionProps}>{copy.count}</Cell>}
              <Cell {...motionProps}>{copy.state}</Cell>
            </tr>
          </tbody>
        </table>
      </ColumnSnapMotion>
    </div>
  );
}

const meta = {
  title: 'Organisms/Table/ColumnSnapMotion',
  component: ColumnSnapMotion,
  parameters: { layout: 'centered' },
  args: { enabled: true, children: null },
  render: ({ enabled }) => <ColumnExample enabled={enabled} />,
} satisfies Meta<typeof ColumnSnapMotion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enabled: Story = {};
export const Static: Story = { args: { enabled: false } };

/**
 * When the layout feature chunk cannot load, ColumnSnapMotion logs a warning
 * and leaves the table static: columns still show and hide, without the snap.
 */
export const ErrorFeaturesUnavailable: Story = {
  args: { enabled: false },
  parameters: {
    docs: {
      description: {
        story:
          'The layout feature chunk failed to load, so the table falls back to static column changes.',
      },
    },
  },
};

export const LongColumnContent: Story = {
  render: ({ enabled }) => (
    <ColumnExample
      enabled={enabled}
      copy={{
        ...ENGLISH,
        show: 'Show lifetime streams across every platform',
        hide: 'Hide lifetime streams across every platform',
        streams: 'Lifetime Streams Across Every Platform',
        title:
          'First Light (Extended Anniversary Remaster featuring The Midnight Orchestra)',
        count: '1,240,118,402',
        state: 'Released Worldwide',
      }}
    />
  ),
};

export const RtlColumns: Story = {
  render: ({ enabled }) => (
    <ColumnExample
      enabled={enabled}
      dir='rtl'
      copy={{
        show: 'إظهار مرات التشغيل',
        hide: 'إخفاء مرات التشغيل',
        release: 'الإصدار',
        streams: 'مرات التشغيل',
        status: 'الحالة',
        title: 'أول ضوء',
        count: '١٬٢٤٠',
        state: 'صدر',
      }}
    />
  ),
};
