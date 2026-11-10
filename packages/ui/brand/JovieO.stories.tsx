import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { JovieO, type JovieOProps } from './JovieO';
import { JOVIE_O_STATES } from './jovie-o-motion';

const meta: Meta<typeof JovieO> = {
  title: 'UI/Brand/JovieO',
  component: JovieO,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { size: 48, state: 'idle', label: 'Jovie' },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const AllStates: Story = {
  render: () => (
    <div className='flex items-center gap-6 text-primary-token'>
      {JOVIE_O_STATES.map(state => (
        <JovieO key={state} size={48} state={state} label={state} />
      ))}
    </div>
  ),
};

export const PixelMasters: Story = {
  render: () => (
    <div className='flex items-end gap-6 text-primary-token'>
      {[16, 24, 32, 64].map(size => (
        <JovieO key={size} size={size} label={`${size} px`} />
      ))}
    </div>
  ),
};

export const Ovie: Story = {
  args: { variant: 'ov', size: 64, label: 'Ovie' },
};

export const ReducedMotionStill: Story = {
  args: { state: 'loading', still: true },
};

/** Caller contexts use the mark's five existing states, not new brand states. */
function MarkContext({
  mark,
  children,
  direction,
}: {
  readonly mark: JovieOProps;
  readonly children: ReactNode;
  readonly direction?: 'rtl';
}) {
  return (
    <div
      dir={direction}
      className='flex max-w-xs items-start gap-4 text-primary-token'
    >
      <JovieO {...mark} />
      <p className='text-sm leading-relaxed text-pretty'>{children}</p>
    </div>
  );
}

export const Loading: Story = {
  args: { state: 'loading', label: 'Updating Jovie' },
  render: args => (
    <MarkContext mark={args}>Downloading the latest version.</MarkContext>
  ),
};

export const Empty: Story = {
  args: { state: 'idle', label: undefined },
  render: args => (
    <MarkContext mark={args}>
      No update is available. Jovie is up to date.
    </MarkContext>
  ),
};

export const Error: Story = {
  args: { state: 'error', label: 'Update failed' },
  render: args => (
    <MarkContext mark={args}>
      The update did not download. Try again.
    </MarkContext>
  ),
};

export const Partial: Story = {
  args: { state: 'thinking', label: 'Checking the update' },
  render: args => (
    <MarkContext mark={args}>Download received. Checking the file.</MarkContext>
  ),
};

export const LongContent: Story = {
  args: { state: 'loading', label: 'Updating Jovie in the background' },
  render: args => (
    <MarkContext mark={args}>
      Keep working while Jovie downloads the latest version. We will let you
      know when it is ready so you can choose a good time to restart.
    </MarkContext>
  ),
};

export const Offline: Story = {
  args: { state: 'error', label: 'Connection unavailable' },
  render: args => (
    <MarkContext mark={args}>
      You are offline. Reconnect to continue.
    </MarkContext>
  ),
};

export const PermissionDenied: Story = {
  args: { state: 'error', label: 'Access unavailable' },
  render: args => (
    <MarkContext mark={args}>
      You do not have access to this workspace. Ask its owner for an invitation.
    </MarkContext>
  ),
};

export const RtlOverflow: Story = {
  args: { state: 'loading', label: 'Jovie' },
  render: args => (
    <MarkContext mark={args} direction='rtl'>
      يجري تحديث Jovie. يمكنك مواصلة العمل وسنخبرك عندما يكون التحديث جاهزًا.
    </MarkContext>
  ),
};
