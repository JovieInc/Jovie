import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SettingsToggleRow } from './SettingsToggleRow';

const meta: Meta<typeof SettingsToggleRow> = {
  title: 'Molecules/Settings/SettingsToggleRow',
  component: SettingsToggleRow,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof SettingsToggleRow>;

export const Interactive: Story = {
  args: {
    title: 'High Contrast',
    description: 'Increase contrast for text, borders, and surfaces.',
    checked: false,
    onCheckedChange: fn(),
    ariaLabel: 'Toggle high contrast mode',
  },
};

export const Disabled: Story = {
  args: {
    title: 'High Contrast',
    description: 'Increase contrast for text, borders, and surfaces.',
    checked: false,
    onCheckedChange: fn(),
    disabled: true,
    ariaLabel: 'Toggle high contrast mode',
  },
};

export const Gated: Story = {
  args: {
    gated: true,
    title: 'Double Opt-in Verification',
    description: 'Verify fan email addresses before notifications begin.',
    gatePlanName: 'Growth',
    gateFeatureContext: 'Double opt-in confirmation',
  },
};
