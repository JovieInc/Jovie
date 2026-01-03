import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyToClipboardButton } from './CopyToClipboardButton';

const meta: Meta<typeof CopyToClipboardButton> = {
  title: 'Dashboard/Molecules/CopyToClipboardButton',
  component: CopyToClipboardButton,
  parameters: {
    layout: 'padded',
  },
  args: {
    relativePath: '/example-handle',
    idleLabel: 'Copy URL',
    successLabel: 'Copied!',
    errorLabel: 'Failed to copy',
    iconName: undefined,
  },
  argTypes: {
    relativePath: { control: 'text' },
    idleLabel: { control: 'text' },
    successLabel: { control: 'text' },
    errorLabel: { control: 'text' },
    iconName: { control: 'text' },
    className: { control: 'text' },
    onCopySuccess: { action: 'copy-success' },
    onCopyError: { action: 'copy-error' },
  },
};

export default meta;

type Story = StoryObj<typeof CopyToClipboardButton>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    iconName: 'Copy',
  },
};
