import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useEffect, useState } from 'react';
import { fn } from 'storybook/test';
import { ChatInput } from './ChatInput';

type ChatInputStoryProps = ComponentProps<typeof ChatInput>;

function ControlledChatInput(args: ChatInputStoryProps) {
  const [draft, setDraft] = useState(args.value);

  useEffect(() => {
    setDraft(args.value);
  }, [args.value]);

  const handleChange = (nextValue: string) => {
    setDraft(nextValue);
    args.onChange(nextValue);
  };

  return (
    <div className='w-[min(44rem,calc(100vw-2rem))]'>
      <ChatInput {...args} value={draft} onChange={handleChange} />
    </div>
  );
}

const meta = {
  title: 'Jovie/Components/ChatInput',
  component: ChatInput,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: [
        'mention',
        'containerRef',
        'hiddenDivRef',
        'internalTextareaRef',
        'handleKeyDown',
        'isAtMaxHeight',
        'measuredHeight',
        'reducedMotion',
        'isNearLimit',
        'hasAttachButton',
        'plusMenuOpen',
        'setPlusMenuOpen',
        'handlePreserveFocus',
        'event',
        'isDictationSupported',
        'isListening',
        'handleMicPushStart',
        'handleMicPushEnd',
        'handleMicToggle',
        'canSend',
        'canInterruptAndSend',
        'onSend',
        'setIsFocused',
        'setComposerFocused',
        'isPickerOpen',
        'isRootPickerOpen',
        'pickerListId',
        'pickerActiveRowId',
        'attachDisabledForPicker',
        'isHero',
      ],
    },
  },
  args: {
    value: '',
    onChange: fn(),
    onSubmit: fn(),
    onInterruptAndSend: fn(),
    isLoading: false,
    isSubmitting: false,
    placeholder: 'Ask Jovie anything...',
    variant: 'hero',
    onFileAttach: fn(),
    onAudioAttach: fn(),
    isFileProcessing: false,
    onPaste: fn(),
    onPickerOpenChange: fn(),
    dictationEnabled: false,
  },
  render: args => <ControlledChatInput {...args} />,
} satisfies Meta<typeof ChatInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Drafting: Story = {
  args: {
    value: 'Draft a concise release announcement for Friday.',
    variant: 'default',
  },
};

export const ProcessingFile: Story = {
  args: {
    value: 'Use the attached cover art for the campaign.',
    isFileProcessing: true,
    variant: 'default',
  },
};

export const Streaming: Story = {
  args: {
    value: 'Tighten the opening paragraph.',
    isLoading: true,
    isStreaming: true,
    onStop: fn(),
    variant: 'compact',
  },
};
