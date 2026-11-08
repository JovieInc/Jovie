import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { Orbit } from './Orbit';
import './stage.css';

function Frame(Story: () => ReactNode) {
  return (
    <div
      className='hv3'
      style={{ position: 'relative', width: 900, height: 700 }}
    >
      <Story />
    </div>
  );
}

/** The Orbit: hairline rings with one lit ion arc that is the section key light. */
const meta = {
  title: 'Marketing/Homepage v3/Orbit',
  component: Orbit,
  decorators: [Frame],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
} satisfies Meta<typeof Orbit>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProfileArc: Story = {
  args: { id: 'story-orbit', rings: [380, 300, 220], arc: [38, 44] },
};

export const ClosedRing: Story = {
  args: { id: 'story-orbit-closed', rings: [600], arc: [0, 360], closed: true },
};
