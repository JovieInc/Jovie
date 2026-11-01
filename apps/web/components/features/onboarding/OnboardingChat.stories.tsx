import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingChat } from './OnboardingChat';

const meta = {
  title: 'Features/Onboarding/OnboardingChat',
  component: OnboardingChat,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'turnstileToken',
        'state',
        'shouldShowTurnstileBanner',
        'turnstilePanel',
        'displayMessages',
        'hasConversationStarted',
        'isBusy',
        'isStreaming',
        'lastAssistantMessageId',
        'onboardingComposerSurface',
        'onHandleCandidateChange',
        'onConfirmHandle',
        'onAttachAccount',
        'onNoneOfTheseArtists',
        'onSelectArtist',
        'profileBuilderState',
        'shouldDockComposer',
        'entryMode',
        'composerPickerOpen',
        'isLoading',
      ],
    },
  },
} satisfies Meta<typeof OnboardingChat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    turnstileToken: null,
  },
};

/** Taken handle with a starter prompt: the taken state wins, no prefilled claim (JOV-9624). */
export const TakenHandleWithStarterPrompt: Story = {
  args: {
    turnstileToken: null,
    starterHandoff: { kind: 'prompt', prompt: 'I want my own jov.ie.' },
    entryProfile: {
      status: 'claimed',
      handle: 'tim',
      displayName: 'Tim White',
      avatarUrl: null,
    },
  },
};

/**
 * Claim transcript (Pen R6As7U · T68xUV): 16px body, dark user bubble, one
 * Jovie speaker row per agent turn, widgets on the agent text edge.
 */
export const ClaimTranscript: Story = {
  args: {
    turnstileToken: 'storybook-token',
    turnstileStatus: 'verified',
    initialMessages: [
      {
        id: 'story-user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'I want to claim jov.ie/timwhite' }],
      },
      {
        id: 'story-agent-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Good news, that name is open. Confirm it and I will start your profile from your music.',
          },
          {
            type: 'tool-checkHandle',
            toolCallId: 'story-check-handle',
            state: 'output-available',
            input: { handle: 'timwhite' },
            output: {
              action: 'check_handle',
              handle: 'timwhite',
              available: true,
            },
          },
        ],
      },
    ],
  },
  decorators: [
    Story => {
      // The handle card checks availability live; answer as the API would.
      (
        window as Window & {
          __jovieApiMock?: (request: { url: URL }) => Response | undefined;
        }
      ).__jovieApiMock = ({ url }) =>
        url.pathname === '/api/handle/check'
          ? Response.json({ available: true, handle: 'timwhite' })
          : undefined;
      return (
        <div style={{ width: 880, height: 720, display: 'flex' }}>
          <Story />
        </div>
      );
    },
  ],
};
