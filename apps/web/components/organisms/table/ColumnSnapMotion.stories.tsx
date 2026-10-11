import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { td as MotionCell, th as MotionHeader } from 'motion/react-m';
import { useState } from 'react';
import { ColumnSnapMotion } from './ColumnSnapMotion';

function ColumnExample({ enabled }: { readonly enabled: boolean }) {
  const [showStreams, setShowStreams] = useState(false);
  const Header = enabled ? MotionHeader : 'th';
  const Cell = enabled ? MotionCell : 'td';
  const motionProps = enabled
    ? { layout: 'position' as const, transition: { duration: 0.15 } }
    : {};
  return (
    <div className='flex w-80 flex-col gap-4'>
      <Button onClick={() => setShowStreams(value => !value)}>
        {showStreams ? 'Hide streams' : 'Show streams'}
      </Button>
      <ColumnSnapMotion enabled={enabled}>
        <table className='w-full text-left text-sm'>
          <thead>
            <tr>
              <Header {...motionProps}>Release</Header>
              {showStreams && <Header {...motionProps}>Streams</Header>}
              <Header {...motionProps}>Status</Header>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Cell {...motionProps}>First light</Cell>
              {showStreams && <Cell {...motionProps}>1,240</Cell>}
              <Cell {...motionProps}>Released</Cell>
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
