import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { StageMotion } from './StageMotion';
import { Callout } from './Surfaces';
import './stage.css';

function SnapStage({
  children,
  label,
}: Readonly<{ children: ReactNode; label: string }>) {
  return (
    <div
      className='hv3'
      style={{ position: 'relative', width: 480, height: 200 }}
    >
      <span style={{ position: 'absolute', left: 80, top: 90 }}>
        5054526843813
        <i
          aria-hidden
          className='hv3-anchor hv3-anchor--after'
          data-hv3-anchor='story-upc'
        />
      </span>
      <Callout anchor='story-upc' label={label} />
      {children}
    </div>
  );
}

/** The client layer: snaps a callout to its anchor and runs the motion. */
const meta = {
  title: 'Marketing/Homepage v3/StageMotion',
  component: StageMotion,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  render: args => (
    <SnapStage label='per release'>
      <StageMotion {...args} />
    </SnapStage>
  ),
} satisfies Meta<typeof StageMotion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SnappedCallout: Story = {
  args: { paletteQuery: 'releases', paletteTarget: 'Releases' },
};

/**
 * Empty: a stage with no anchors, callouts, connectors or palette. The layer
 * finds nothing to place and leaves the stage as it is.
 */
export const EmptyStage: Story = {
  args: { paletteQuery: 'releases', paletteTarget: 'Releases' },
  render: args => (
    <div
      className='hv3'
      style={{ position: 'relative', width: 480, height: 200 }}
    >
      <StageMotion {...args} />
    </div>
  ),
};

/** Long content: a long callout label snapped to the same anchor. */
export const LongContentCallout: Story = {
  args: { paletteQuery: 'releases', paletteTarget: 'Releases' },
  render: args => (
    <SnapStage label='per release, per territory, per service, refreshed every night'>
      <StageMotion {...args} />
    </SnapStage>
  ),
};

/** Right-to-left: the snapped callout inside an RTL document. */
export const RtlSnappedCallout: Story = {
  args: { paletteQuery: 'releases', paletteTarget: 'Releases' },
  render: args => (
    <div dir='rtl'>
      <SnapStage label='per release'>
        <StageMotion {...args} />
      </SnapStage>
    </div>
  ),
};
