import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StageMotion } from './StageMotion';
import { Callout } from './Surfaces';
import './stage.css';

/** The client layer: snaps a callout to its anchor and runs the motion. */
const meta = {
  title: 'Marketing/Homepage v3/StageMotion',
  component: StageMotion,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  render: args => (
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
      <Callout anchor='story-upc' label='per release' />
      <StageMotion {...args} />
    </div>
  ),
} satisfies Meta<typeof StageMotion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SnappedCallout: Story = {
  args: { paletteQuery: 'releases', paletteTarget: 'Releases' },
};
