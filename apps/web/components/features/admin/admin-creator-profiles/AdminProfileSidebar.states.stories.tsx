import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import '@/styles/system-b-app.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AdminProfileSidebar } from './AdminProfileSidebar';
import {
  partialEnrichment,
  sidebarContact,
  sidebarProfile,
} from './adminProfileSidebar.test-fixtures';

function SidebarFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <div className='h-160 w-90'>{children}</div>
    </QueryClientProvider>
  );
}

/** Rendered states of the creator profile rail beyond its default stories. */
const meta = {
  title: 'Admin/AdminProfileSidebar/States',
  component: AdminProfileSidebar,
  decorators: [
    function SidebarFrameDecorator(Story) {
      return (
        <SidebarFrame>
          <Story />
        </SidebarFrame>
      );
    },
  ],
  args: {
    profile: sidebarProfile,
    contact: sidebarContact,
    isOpen: true,
    onClose: () => undefined,
  },
} satisfies Meta<typeof AdminProfileSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: an unclaimed profile whose identity enrichment only partly landed. */
export const PartialEnrichment: Story = {
  args: {
    profile: {
      ...sidebarProfile,
      isClaimed: false,
      userId: null,
      identityEnrichment: partialEnrichment,
    },
  },
};

/** Right-to-left: the rail inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
