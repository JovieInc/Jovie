import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider, useSidebar } from './context';

function SidebarStateReadout() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  return (
    <div className='space-y-2 p-4 text-sm text-primary-token'>
      <p>
        state: <span className='font-caption'>{state}</span>
      </p>
      <p>
        isMobile: <span className='font-caption'>{String(isMobile)}</span>
      </p>
      <Button type='button' variant='outline' size='sm' onClick={toggleSidebar}>
        Toggle sidebar
      </Button>
    </div>
  );
}

const meta = {
  title: 'Organisms/Sidebar/context',
  component: SidebarProvider,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: <SidebarStateReadout />,
  },
} satisfies Meta<typeof SidebarProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DefaultClosed: Story = {
  args: {
    defaultOpen: false,
  },
};

const LONG_RELEASE_URL =
  'https://jov.ie/florence-okonkwo-vasquez-and-the-northern-lights-philharmonic-collective/midnight-drive-extended-club-mix-deluxe-anniversary-edition';

/**
 * Long content: an unbroken release link wider than the viewport. The
 * provider's shell wrapper clips sideways overflow so the page never scrolls
 * horizontally; the content column owns its own wrapping.
 */
export const LongContentUnbrokenLink: Story = {
  parameters: { layout: 'fullscreen' },
  args: {
    children: (
      <div className='flex min-w-0 flex-col gap-3'>
        <SidebarStateReadout />
        <p className='whitespace-nowrap px-4 text-sm text-secondary-token'>
          {LONG_RELEASE_URL}
        </p>
        <p className='break-all px-4 text-sm text-secondary-token'>
          {LONG_RELEASE_URL}
        </p>
      </div>
    ),
  },
};

function ArabicSidebarStateReadout() {
  const { state, toggleSidebar } = useSidebar();
  return (
    <div className='space-y-2 p-4 text-sm text-primary-token'>
      <p>
        حالة الشريط الجانبي:{' '}
        <span className='font-caption'>
          {state === 'open' ? 'مفتوح' : 'مغلق'}
        </span>
      </p>
      <Button type='button' variant='outline' size='sm' onClick={toggleSidebar}>
        تبديل الشريط الجانبي
      </Button>
    </div>
  );
}

/** Right-to-left: the provider's flex shell starts from the right edge. */
export const RtlArabicShell: Story = {
  parameters: { layout: 'fullscreen' },
  args: {
    dir: 'rtl',
    children: (
      <>
        <nav
          aria-label='التنقل الرئيسي'
          className='w-56 shrink-0 border-l border-subtle p-4 text-sm text-secondary-token'
        >
          <ul className='space-y-2'>
            <li>الإصدارات</li>
            <li>الجمهور</li>
            <li>الأرباح</li>
          </ul>
        </nav>
        <ArabicSidebarStateReadout />
      </>
    ),
  },
};
