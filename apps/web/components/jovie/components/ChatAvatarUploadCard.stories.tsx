import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ChatAvatarUploadCard } from './ChatAvatarUploadCard';

const STORY_PROFILE_ID = 'chat-avatar-upload-story-profile';

function buildDashboardData(withProfile: boolean): DashboardData {
  return {
    user: { id: 'story-user' },
    creatorProfiles: [],
    selectedProfile: withProfile
      ? ({ id: STORY_PROFILE_ID } as DashboardData['selectedProfile'])
      : null,
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin: false,
  } as unknown as DashboardData;
}

function createStoryQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

function ChatAvatarUploadCardHarness({
  children,
  withProfile = true,
}: {
  readonly children: ReactNode;
  readonly withProfile?: boolean;
}) {
  return (
    <QueryClientProvider client={createStoryQueryClient()}>
      <DashboardDataProvider value={buildDashboardData(withProfile)}>
        <div className='w-sm max-w-full'>{children}</div>
      </DashboardDataProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Jovie/ChatAvatarUploadCard',
  component: ChatAvatarUploadCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <ChatAvatarUploadCardHarness>
        <Story />
      </ChatAvatarUploadCardHarness>
    ),
  ],
} satisfies Meta<typeof ChatAvatarUploadCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Idle dropzone — profile selected, ready to upload. */
export const Default: Story = {};

/** Validation failure face after an unsupported file is chosen. */
export const ErrorUploadFailed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Choose Profile Photo File');
    const file = new File(['not-an-image'], 'notes.txt', {
      type: 'text/plain',
    });
    await userEvent.upload(input, file, { applyAccept: false });
    await expect(canvas.getByText(/Invalid file type/i)).toBeInTheDocument();
  },
};

/** Narrow frame so the validation error wraps. */
export const LongContent: Story = {
  decorators: [
    Story => (
      <div className='w-40'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Choose Profile Photo File');
    const file = new File(['not-an-image'], 'notes.txt', {
      type: 'text/plain',
    });
    await userEvent.upload(input, file, { applyAccept: false });
    await expect(canvas.getByText(/Invalid file type/i)).toBeInTheDocument();
  },
};

/** RTL overflow frame for the dropzone. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-64'>
        <Story />
      </div>
    ),
  ],
};
