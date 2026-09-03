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

export const Default: Story = {};
