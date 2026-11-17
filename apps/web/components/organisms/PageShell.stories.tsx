import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PageContent, PageHeader, PageShell } from './PageShell';

const meta: Meta<typeof PageShell> = {
  title: 'Organisms/PageShell',
  component: PageShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <>
        <PageHeader title='Releases' description='Manage your catalog' />
        <PageContent>
          <div>Page content</div>
        </PageContent>
      </>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Canonical default — identical geometry to AppShellContentPanel (JOV-4867). */
export const Default: Story = {};

/** Legacy unframed/unpadded look via explicit props on the adapter. */
export const Unframed: Story = {
  args: {
    frame: 'none',
    contentPadding: 'none',
  },
};

/** Table surface with page-owned scroll (settings route pattern). */
export const TableSurfacePageScroll: Story = {
  args: {
    surfaceMode: 'table',
    scroll: 'page',
    maxWidth: 'wide',
  },
};

/** A page whose collection is empty keeps its header and a quiet line. */
export const EmptyContent: Story = {
  args: {
    children: (
      <>
        <PageHeader title='Releases' description='Manage your catalog' />
        <PageContent>
          <p className='text-sm text-tertiary-token'>No releases yet</p>
        </PageContent>
      </>
    ),
  },
};

/** Title only: no description, breadcrumbs or action. */
export const PartialTitleOnly: Story = {
  args: {
    children: (
      <>
        <PageHeader title='Releases' />
        <PageContent>
          <div>Page content</div>
        </PageContent>
      </>
    ),
  },
};

export const LongContentHeader: Story = {
  args: {
    children: (
      <>
        <PageHeader
          title='The Extraordinarily Long Album Title That Keeps Going Well Past Any Reasonable Line Length (Deluxe Anniversary Remastered Edition)'
          description='A description that is also far longer than the header has room for, so it truncates instead of wrapping the header to a second row.'
          action={
            <button
              type='button'
              className='rounded-md border border-subtle px-3 py-1 text-sm'
            >
              Add release
            </button>
          }
        />
        <PageContent>
          <div className='space-y-3'>
            {Array.from({ length: 24 }, (_, index) => index + 1).map(track => (
              <p
                key={`track-${track}`}
                className='text-sm text-secondary-token break-words'
              >
                Track {track}: An Unusually Long Track Title That Wraps Inside
                The Content Panel
              </p>
            ))}
          </div>
        </PageContent>
      </>
    ),
  },
};

export const RtlPage: Story = {
  args: {
    children: (
      <>
        <PageHeader title='الإصدارات' description='إدارة الكتالوج الخاص بك' />
        <PageContent>
          <div>محتوى الصفحة</div>
        </PageContent>
      </>
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
