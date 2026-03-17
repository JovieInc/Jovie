import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { SettingsToggleRow } from './SettingsToggleRow';

const meta: Meta<typeof SettingsToggleRow> = {
  title: 'Dashboard/Molecules/SettingsToggleRow',
  component: SettingsToggleRow,
  parameters: {
    layout: 'padded',
  },
  args: {
    title: 'Enable notifications',
    description:
      'Send me updates about activity and important account changes.',
    checked: true,
    disabled: false,
    ariaLabel: 'Enable notifications',
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    ariaLabel: { control: 'text' },
    onCheckedChange: { action: 'checked-change' },
  },
};

export default meta;

type Story = StoryObj<typeof SettingsToggleRow>;

function ControlledSettingsToggleRow(
  args: React.ComponentProps<typeof SettingsToggleRow>
) {
  const [checked, setChecked] = React.useState<boolean>(args.checked ?? false);

  return (
    <div className='max-w-xl'>
      <SettingsToggleRow
        {...args}
        checked={checked}
        onCheckedChange={next => {
          setChecked(next);
          args.onCheckedChange?.(next);
        }}
      />
    </div>
  );
}

export const Default: Story = {
  render: args => <ControlledSettingsToggleRow {...args} />,
};

export const WithoutDescription: Story = {
  args: {
    description: undefined,
  },
  render: args => <ControlledSettingsToggleRow {...args} />,
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
