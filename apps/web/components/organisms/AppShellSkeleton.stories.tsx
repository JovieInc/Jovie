import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AppShellSkeleton } from './AppShellSkeleton';

const meta = {
  title: 'Organisms/AppShellSkeleton',
  component: AppShellSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AppShellSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OvBrand: Story = {
  args: {
    brandVariant: 'ov',
  },
};

export const CollapsedSidebar: Story = {
  args: {
    sidebarCollapsed: true,
  },
};

export const NoSidebar: Story = {
  args: {
    sidebar: null,
  },
};

/** The skeleton is the workspace loading state: default nav and main rows. */
export const LoadingWorkspace: Story = {};

/** Onboarding surfaces (/start) mount the fallback without the sidebar. */
export const PartialWithoutSidebar: Story = {
  args: {
    sidebar: null,
  },
};

/** A route-specific main override with a long heading stays inside the frame. */
export const LongContentMainOverride: Story = {
  args: {
    main: (
      <div className='mx-auto w-full max-w-5xl space-y-3 p-6'>
        <p className='text-sm text-secondary-token break-words'>
          Preparing the release workspace for The Extraordinarily Long Album
          Title That Keeps Going Well Past Any Reasonable Line Length (Deluxe
          Anniversary Remastered Edition)…
        </p>
        <div className='skeleton h-4 w-full rounded' />
        <div className='skeleton h-4 w-3/4 rounded' />
      </div>
    ),
  },
};

/** The fallback mirrors in a right-to-left document. */
export const RtlWorkspace: Story = {
  args: {
    main: (
      <div className='mx-auto w-full max-w-5xl space-y-3 p-6'>
        <p className='text-sm text-secondary-token'>
          جارٍ تحميل مساحة العمل الخاصة بك…
        </p>
        <div className='skeleton h-4 w-full rounded' />
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
