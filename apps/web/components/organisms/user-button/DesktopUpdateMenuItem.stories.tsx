import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LucideIcon } from 'lucide-react';
import { isValidElement, type ReactNode } from 'react';
import type { DesktopUpdateViewState } from '@/lib/desktop/desktop-updates';
import { buildDesktopUpdateMenuItem } from './UserButton';

// Lucide icons are forwardRef objects, not functions, so a `typeof` check
// rendered the component object itself as a React child.
function MenuItemIcon({
  icon,
}: {
  readonly icon: LucideIcon | ReactNode;
}): ReactNode {
  const isComponent =
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && '$$typeof' in icon);
  if (!isComponent || isValidElement(icon)) return icon as ReactNode;
  const Icon = icon as LucideIcon;
  return <Icon className='h-4 w-4' />;
}

function MenuItemPreview({
  state,
}: {
  readonly state: DesktopUpdateViewState;
}) {
  const items = buildDesktopUpdateMenuItem(state, () => undefined);
  return (
    <div className='w-80 rounded-xl border border-subtle bg-surface-1 p-1'>
      {items.length === 0 ? (
        <p className='px-2.5 py-1.5 text-2xs text-tertiary-token'>
          Menu item hidden
        </p>
      ) : (
        items.map(item =>
          item.type === 'action' ? (
            <div
              key={item.id}
              className='flex h-7 items-center gap-2.5 rounded-md px-2.5 text-app text-primary-token'
            >
              <MenuItemIcon icon={item.icon} />
              {item.label}
            </div>
          ) : (
            <div key={item.id} className='-mx-1 my-0 h-2' />
          )
        )
      )}
    </div>
  );
}

const meta = {
  title: 'Organisms/DesktopUpdateMenuItem',
  component: MenuItemPreview,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MenuItemPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {
  args: {
    state: {
      state: 'available',
      version: '26.9.16',
      releaseDate: null,
      notesUrl: 'https://jov.ie/changelog',
    },
  },
};

export const Downloading: Story = {
  args: {
    state: {
      state: 'downloading',
      percent: 42,
      transferredBytes: 1,
      totalBytes: 2,
      bytesPerSecond: 1,
    },
  },
};

export const Ready: Story = {
  args: { state: { state: 'ready', version: '26.9.16' } },
};

export const ErrorState: Story = {
  args: { state: { state: 'error', message: 'offline', retryable: true } },
};

export const HiddenWhenIdle: Story = { args: { state: { state: 'idle' } } };

export const AvailableLight: Story = {
  ...Available,
  parameters: { themes: { themeOverride: 'light' } },
};

export const ReadyLight: Story = {
  ...Ready,
  parameters: { themes: { themeOverride: 'light' } },
};
