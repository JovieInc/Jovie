import '../../../styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { UIMessage } from 'ai';
import { OnboardingChat } from './OnboardingChat';

type ApiMock = (request: {
  url: URL;
}) => Response | Promise<Response> | undefined;

/**
 * State stories answer /api/chat from a fixture so no story leaves the
 * browser; every other route falls through to the preview's default mock.
 */
function answerChat(answer: () => Response | Promise<Response>) {
  const w = window as Window & { __jovieApiMock?: ApiMock };
  const previous = w.__jovieApiMock;
  w.__jovieApiMock = ({ url }) =>
    url.pathname === '/api/chat' ? answer() : undefined;
  return () => {
    w.__jovieApiMock = previous;
  };
}

const chatFailure = (status: number, errorCode: string, error: string) =>
  Response.json({ error, errorCode }, { status });

const chatFrame: Decorator = Story => (
  <div style={{ width: 880, height: 720, display: 'flex' }}>
    <Story />
  </div>
);

const text = (id: string, role: 'user' | 'assistant', value: string) =>
  ({ id, role, parts: [{ type: 'text', text: value }] }) as UIMessage;

/** A starter that sends itself as soon as the story mounts. */
const autoSentStarter = {
  starterHandoff: { kind: 'prompt', prompt: 'I want to claim jov.ie/sam.' },
  turnstileToken: 'storybook-token',
  turnstileStatus: 'verified',
} as const;

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

/** The real composer and reserved verification instruction before a starter sends. */
export const StarterVerification: Story = {
  args: {
    starterHandoff: { kind: 'prompt', prompt: 'I want to claim jov.ie/sam.' },
    turnstileToken: null,
    turnstileStatus: 'loading',
    turnstileHasSiteKey: true,
    turnstilePanel: <span />,
    headerOverlay: true,
    // Keep the starter unsent in Storybook's development-mode auth bypass.
    interactionDisabled: true,
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div style={{ width: '100%', height: '100dvh', display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
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

/** First visit with nothing typed: the entry heading over the composer. */
export const EmptyBlankEntry: Story = {
  args: { turnstileToken: null },
  decorators: [chatFrame],
};

/** The starter was sent and the first reply has not arrived: thinking row. */
export const LoadingFirstReply: Story = {
  args: autoSentStarter,
  beforeEach: () => answerChat(() => new Promise<Response>(() => undefined)),
  decorators: [chatFrame],
};

/** The chat service failed: the draft returns to the composer with a retry. */
export const ErrorServiceUnavailable: Story = {
  args: autoSentStarter,
  beforeEach: () =>
    answerChat(() => chatFailure(503, 'INTERNAL_ERROR', 'Service unavailable')),
  decorators: [chatFrame],
};

/** The request never reached the server: the offline recovery row. */
export const OfflineNetworkDropped: Story = {
  args: autoSentStarter,
  beforeEach: () =>
    answerChat(() => Promise.reject(new TypeError('Failed to fetch'))),
  decorators: [chatFrame],
};

/** The server refused the security token: the check is offered again. */
export const PermissionDeniedSecurityCheck: Story = {
  args: autoSentStarter,
  beforeEach: () =>
    answerChat(() => chatFailure(403, 'TURNSTILE_REQUIRED', 'Forbidden')),
  decorators: [chatFrame],
};

/** Handle confirmed, the rest of the profile still to come. */
export const PartialHandleConfirmed: Story = {
  args: {
    turnstileToken: 'storybook-token',
    turnstileStatus: 'verified',
    initialMessages: [
      text('story-user-1', 'user', 'I want to claim jov.ie/timwhite'),
      {
        id: 'story-agent-1',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'checkHandle',
            toolCallId: 'story-confirmed',
            state: 'output-available',
            input: { handle: 'timwhite' },
            output: { action: 'handle_confirmed', handle: 'timwhite' },
          },
        ],
      },
      text('story-agent-2', 'assistant', 'Locked in. What do you release?'),
    ],
  },
  decorators: [chatFrame],
};

/** A long transcript docks the composer under a scrolling thread. */
export const LongContentConversation: Story = {
  args: {
    turnstileToken: 'storybook-token',
    turnstileStatus: 'verified',
    initialMessages: Array.from({ length: 6 }, (_, i) => [
      text(
        `story-user-${i}`,
        'user',
        `Question ${i + 1}: how should I set up my release page before the single drops next Friday?`
      ),
      text(
        `story-agent-${i}`,
        'assistant',
        `Answer ${i + 1}: start with the pre-save link, add the artwork, then tell your fans where to listen on release day. I will keep the page current as the release moves from announcement to out now.`
      ),
    ]).flat(),
  },
  decorators: [chatFrame],
};

/** The entry and composer inside a right-to-left page. */
export const RtlBlankEntry: Story = {
  args: { turnstileToken: null },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
    chatFrame,
  ],
};
