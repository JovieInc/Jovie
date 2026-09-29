import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { SmartHandleInput } from './SmartHandleInput';

const meta = {
  title: 'Organisms/SmartHandleInput',
  component: SmartHandleInput,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    value: 'jovie',
    onChange: fn(),
    showAvailability: false,
  },
} satisfies Meta<typeof SmartHandleInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledInput(props: React.ComponentProps<typeof SmartHandleInput>) {
  const [value, setValue] = useState(props.value);
  return <SmartHandleInput {...props} value={value} onChange={setValue} />;
}

export const Default: Story = {
  render: args => <ControlledInput {...args} />,
};
