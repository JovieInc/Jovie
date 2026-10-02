import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useEffect, useState } from 'react';
import { fn } from 'storybook/test';
import type { ElectronAPI } from '@/lib/desktop/electron-bridge';
import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';
import { ChatEmptyStateGreeting } from './ChatEmptyStateGreeting';
import { ChatEmptyStateOpportunityCards } from './ChatEmptyStateOpportunityCards';
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
        'micButtonRef',
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
        'dictationUnavailableHint',
        'handleMicUnavailable',
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

/** Docked fixture for palette and recoverable microphone-error geometry. */
export const Docked: Story = {
  parameters: { layout: 'fullscreen' },
  args: { dictationEnabled: true },
  decorators: [
    Story => (
      <div className='flex h-screen items-end justify-center p-6'>
        <Story />
      </div>
    ),
  ],
};

function DesktopGuidanceFixture({
  args,
  centered = false,
}: {
  readonly args: ChatInputStoryProps;
  readonly centered?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState(args.value);
  useEffect(() => {
    const previous = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    const bridge = {
      platform: 'darwin',
      getDictationStatus: async () => ({
        ok: true,
        nativeAvailable: false,
        webSpeechFallbackAllowed: false,
        mode: 'unavailable',
        reason: 'storybook-system-dictation-guidance',
      }),
    } satisfies Partial<ElectronAPI>;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: bridge,
    });
    setReady(true);
    return () => {
      if (previous) Object.defineProperty(window, 'electronAPI', previous);
      else Reflect.deleteProperty(window, 'electronAPI');
    };
  }, []);
  if (!ready) return null;
  return (
    <div className='h-screen p-4'>
      <ChatEmptyStateComposerRegion
        stableDocked={!centered}
        onSelectSample={fn()}
        above={
          centered ? undefined : (
            <div className='space-y-4'>
              <ChatEmptyStateGreeting firstName='Tim' insight={null} />
              <ChatEmptyStateOpportunityCards
                cards={[
                  {
                    id: 'release-checklist',
                    signalType: 'other',
                    typeLabel: 'Suggestion',
                    title: 'Review your release checklist',
                    why: 'Check artwork, credits and links before the release.',
                    createdAt: '2026-01-15T12:00:00.000Z',
                    primaryActionLabel: 'Review',
                    status: 'pending',
                    category: 'suggestion',
                  },
                ]}
                onSelect={card => setDraft(card.title)}
              />
            </div>
          )
        }
      >
        <ChatInput {...args} value={draft} onChange={setDraft} />
      </ChatEmptyStateComposerRegion>
    </div>
  );
}

export const DesktopGuidanceDocked: Story = {
  parameters: { layout: 'fullscreen' },
  args: { dictationEnabled: true },
  render: args => <DesktopGuidanceFixture args={args} />,
};

export const DesktopGuidanceCentered: Story = {
  parameters: { layout: 'fullscreen' },
  args: { dictationEnabled: true },
  render: args => <DesktopGuidanceFixture args={args} centered />,
};

export const DesktopGuidanceLight: Story = {
  ...DesktopGuidanceDocked,
  parameters: { layout: 'fullscreen', themes: { themeOverride: 'light' } },
};
