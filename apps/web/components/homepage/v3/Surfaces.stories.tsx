import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { Callout, CommandPaletteCard, ReleasePage } from './Surfaces';
import './stage.css';
import './product-ui.css';
import './phone.css';
import './surfaces.css';

function Frame(Story: () => ReactNode) {
  return (
    <div
      className='hv3'
      style={{ position: 'relative', width: 800, height: 860 }}
    >
      <Story />
    </div>
  );
}

/** The release page (VrRlg) and the command palette (xhH9P) as homepage surfaces. */
const meta = {
  title: 'Marketing/Homepage v3/Surfaces',
  component: ReleasePage,
  decorators: [Frame],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
} satisfies Meta<typeof ReleasePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeaturedRelease: Story = {
  render: () => (
    <div className='hv3-phone' style={{ width: 390, height: 860 }}>
      <ReleasePage />
    </div>
  ),
};

export const CommandPalette: Story = {
  render: () => <CommandPaletteCard />,
};

/**
 * Long content: a long callout label. The motion layer shortens the leader
 * before the label crosses a frame guide; unplaced, it sits at rest.
 */
export const LongContentCallout: Story = {
  render: () => (
    <div style={{ position: 'relative', width: 480, height: 120 }}>
      <Callout
        anchor='story-long'
        label='per release, per territory, per service, refreshed every night'
      />
    </div>
  ),
};

/** Right-to-left: the release page inside an RTL document. */
export const RtlReleasePage: Story = {
  render: () => (
    <div dir='rtl' className='hv3-phone' style={{ width: 390, height: 860 }}>
      <ReleasePage />
    </div>
  ),
};
