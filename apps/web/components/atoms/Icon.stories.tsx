import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Icon } from './Icon';

const meta = {
  title: 'Atoms/Icon',
  component: Icon,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'Activity',
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sized: Story = {
  args: {
    name: 'Bell',
    size: 32,
  },
};

/** JOV-7207: the mirrored rail-toggle family at its real 14px and 16px sizes. */
export const RailFamily: Story = {
  render: () => (
    <div className='flex items-center gap-4 text-primary-token'>
      {(
        [
          'RailLeftClosed',
          'RailLeftOpen',
          'RailRightClosed',
          'RailRightOpen',
        ] as const
      ).map(name => (
        <span key={name} className='flex items-center gap-1.5'>
          <Icon name={name} size={14} />
          <Icon name={name} size={16} />
        </span>
      ))}
    </div>
  ),
};
