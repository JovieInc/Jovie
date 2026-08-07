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
