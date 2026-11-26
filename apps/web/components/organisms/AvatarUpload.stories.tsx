import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { userEvent, within } from 'storybook/test';
import { AvatarUpload } from './AvatarUpload';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const meta = {
  title: 'Organisms/AvatarUpload',
  component: AvatarUpload,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  decorators: [
    (Story: () => ReactNode) => (
      <QueryClientProvider client={queryClient}>
        <div className='w-[36rem] max-w-[90vw] rounded-xl border border-subtle bg-surface-1 p-6'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    artistName: 'Jordan Lee',
    currentAvatarUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop',
  },
} satisfies Meta<typeof AvatarUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Fallback: Story = {
  args: {
    currentAvatarUrl: null,
  },
};

/** Empty: no photo yet, so the avatar shows initials. */
export const EmptyNoPhoto: Story = {
  args: { currentAvatarUrl: null },
};

/** Error: a rejected file type shows the inline alert under the form. */
export const ErrorInvalidFileType: Story = {
  args: { currentAvatarUrl: null },
  play: async ({ canvasElement }) => {
    const input = await within(canvasElement).findByLabelText(
      'Choose Profile Photo File'
    );
    await userEvent.upload(
      input,
      new File(['pdf'], 'notes.pdf', { type: 'application/pdf' }),
      { applyAccept: false }
    );
  },
};

/** Long content: a long artist name wraps beside the form. */
export const LongContentName: Story = {
  args: {
    artistName:
      'Alexandria Montgomery-Featherstonehaugh III and The Midnight Orchestra',
    currentAvatarUrl: null,
  },
};

/** Rtl: the upload form mirrors for a right-to-left reader. */
export const RtlLayout: Story = {
  args: { artistName: 'جوردان لي', currentAvatarUrl: null },
  decorators: [
    (Story: () => ReactNode) => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
