import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ComposerMicButton } from './ChatComposerToolbar';

const meta = {
  title: 'Jovie/Components/ChatComposerToolbar',
  component: ComposerMicButton,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: [
        'event',
        'canSend',
        'isStreaming',
        'reducedMotion',
        'onMouseDown',
        'isFileProcessing',
        'plusMenuOpen',
        'onOpenChange',
        'disabled',
      ],
    },
  },
} satisfies Meta<typeof ComposerMicButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: {
    isListening: false,
    onPreserveFocus: fn(),
    onPushStart: fn(),
    onPushEnd: fn(),
    onToggle: fn(),
  },
};

export const Listening: Story = {
  args: {
    ...Idle.args,
    isListening: true,
  },
};
