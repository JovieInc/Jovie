import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MoonIcon,
  SmallMoonIcon,
  SmallSunIcon,
  SmallSystemIcon,
  SunIcon,
  SystemIcon,
} from './ThemeIcons';

const meta = {
  title: 'Site/ThemeToggle/ThemeIcons',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Theme icon family with a shared optical treatment and explicit aria-hidden semantics for decorative icon-only controls.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function IconCell({
  children,
  label,
}: Readonly<{ children: React.ReactNode; label: string }>) {
  return (
    <div className='flex min-w-24 flex-col items-center gap-3 rounded-lg border border-subtle bg-surface-1 p-4 text-primary-token'>
      {children}
      <span className='text-xs text-secondary-token'>{label}</span>
    </div>
  );
}

export const Family: Story = {
  render: () => (
    <div className='bg-base p-8'>
      <div className='grid grid-cols-3 gap-3'>
        <IconCell label='System'>
          <SystemIcon />
        </IconCell>
        <IconCell label='Light'>
          <SunIcon />
        </IconCell>
        <IconCell label='Dark'>
          <MoonIcon />
        </IconCell>
        <IconCell label='Small system'>
          <SmallSystemIcon />
        </IconCell>
        <IconCell label='Small light'>
          <SmallSunIcon />
        </IconCell>
        <IconCell label='Small dark'>
          <SmallMoonIcon />
        </IconCell>
      </div>
    </div>
  ),
};
