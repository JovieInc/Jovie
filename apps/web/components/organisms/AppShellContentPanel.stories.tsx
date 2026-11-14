import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AppShellContentPanel } from './AppShellContentPanel';

const meta = {
  title: 'Organisms/AppShellContentPanel',
  component: AppShellContentPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    children: <div className='min-h-48'>Authenticated page content</div>,
  },
} satisfies Meta<typeof AppShellContentPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TableSurface: Story = {
  args: {
    surfaceMode: 'table',
    contentPadding: 'none',
    toolbar: <div className='border-b border-subtle p-3'>Table toolbar</div>,
  },
};

export const SettingsPageScroll: Story = {
  args: {
    maxWidth: 'wide',
    frame: 'none',
    contentPadding: 'none',
    scroll: 'page',
  },
};

/** No toolbar and no frame: the panel renders only its content. */
export const PartialWithoutToolbar: Story = {
  args: {
    frame: 'none',
    'aria-label': 'Releases',
  },
};

export const LongContentScroll: Story = {
  args: {
    scroll: 'page',
    maxWidth: 'reading',
    toolbar: (
      <div className='border-b border-subtle p-3 truncate'>
        Release Planning for The Extraordinarily Long Album Title (Deluxe
        Anniversary Remastered Edition)
      </div>
    ),
    children: (
      <div className='space-y-3'>
        {Array.from({ length: 24 }, (_, index) => index + 1).map(track => (
          <p
            key={`track-${track}`}
            className='break-words text-sm text-secondary-token'
          >
            Track {track}: An Unusually Long Track Title That Wraps Across The
            Reading Column Without Pushing The Panel Wider
          </p>
        ))}
      </div>
    ),
  },
};

export const RtlPanel: Story = {
  args: {
    toolbar: <div className='border-b border-subtle p-3'>الإصدارات</div>,
    children: <div className='min-h-48'>محتوى الصفحة</div>,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
