import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { fn, userEvent, within } from 'storybook/test';
import { GrowthAccessRequestModal } from './GrowthAccessRequestModal';

function QueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Organisms/Billing/GrowthAccessRequestModal',
  component: GrowthAccessRequestModal,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <QueryProvider>
        <Story />
      </QueryProvider>
    ),
  ],
  args: {
    open: true,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof GrowthAccessRequestModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};

/** Empty: nothing typed yet, so the submit action is disabled. */
export const EmptyReason: Story = {};

/** Long content: a long reason fills the field and wraps. */
export const LongContentReason: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await body.findByRole('textbox'),
      'I want to grow my fanbase between releases with smarter links, playlist pitching, tour announcements and fan capture that follows each listener across every platform. '.repeat(
        3
      ),
      { delay: 0 }
    );
  },
};

function RtlFrame({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    const previous = document.documentElement.dir;
    document.documentElement.dir = 'rtl';
    return () => {
      document.documentElement.dir = previous;
    };
  }, []);
  return <>{children}</>;
}

/** Rtl: the dialog mirrors under a right-to-left document. */
export const RtlDialog: Story = {
  decorators: [
    Story => (
      <RtlFrame>
        <Story />
      </RtlFrame>
    ),
  ],
};
