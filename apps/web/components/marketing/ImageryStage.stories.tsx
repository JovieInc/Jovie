import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ImageryStage } from './ImageryStage';

const meta = {
  title: 'Marketing/ImageryStage',
  component: ImageryStage,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <div style={{ width: 'min(72rem, 94vw)' }}>
        <Story />
      </div>
    ),
  ],
  args: { id: 'profile-depth' },
} satisfies Meta<typeof ImageryStage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ion plate: the profile in front of the share step. */
export const ProfileDepth: Story = {};

/** Ultra plate: claim your handle in front of connect music. */
export const SetupFlow: Story = { args: { id: 'setup-flow' } };

/** Copy sits in the reserved quiet zone, never over a layer. */
export const WithHeadline: Story = {
  args: {
    id: 'profile-depth',
    children: (
      <h2 style={{ margin: 0, fontSize: '1.75rem', lineHeight: 1.15 }}>
        Be found. Be understood.
      </h2>
    ),
  },
};
