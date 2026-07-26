import { Button, SkeletonAvatar, SkeletonBlock, SkeletonText } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import type { SurfaceStateValue } from './SurfaceState';
import { SurfaceState } from './SurfaceState';

const surfaceStates = [
  'loading',
  'loaded',
  'empty',
  'error',
  'refreshing',
] satisfies readonly SurfaceStateValue[];
const releaseRows = ['Midnight Drive', 'Northbound', 'Signal Fires'];

function Rows({
  loading = false,
  refreshing = false,
}: {
  readonly loading?: boolean;
  readonly refreshing?: boolean;
}) {
  return (
    <div className='divide-y divide-(--app-shell-border)'>
      {releaseRows.map(title => (
        <div
          key={title}
          className='grid h-14 grid-cols-[40px_1fr_auto] items-center gap-3 px-4'
        >
          {loading ? (
            <>
              <SkeletonAvatar size='sm' />
              <SkeletonText className='max-w-56' lines={2} />
              <SkeletonBlock className='h-4 w-10' />
            </>
          ) : (
            <>
              <div className='size-8 rounded-full bg-surface-2' />
              <p className='truncate text-sm font-medium text-primary-token'>
                {title}
              </p>
              <span
                className='text-xs text-secondary-token'
                style={{
                  visibility:
                    refreshing && title === releaseRows[0]
                      ? 'hidden'
                      : 'visible',
                }}
              >
                Ready
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function StateMessage({ children }: { readonly children: string }) {
  return (
    <div className='flex h-[168px] items-center justify-center px-6 text-center text-sm text-secondary-token'>
      {children}
    </div>
  );
}

function SurfaceFixture({ state }: { readonly state: SurfaceStateValue }) {
  return (
    <div className='w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-(--app-shell-border) bg-surface-0'>
      <div className='flex h-12 items-center justify-between border-b border-(--app-shell-border) px-4'>
        <div>
          <p className='text-sm font-semibold capitalize text-primary-token'>
            {state === 'refreshing' ? 'Background refresh' : state}
          </p>
          <p className='text-xs text-tertiary-token'>Stable releases frame</p>
        </div>
        <Button size='sm'>New release</Button>
      </div>
      <SurfaceState
        state={state}
        loadingMode={state === 'refreshing' ? 'background-refresh' : 'section'}
        label={
          state === 'refreshing' ? 'Refreshing releases' : 'Loading releases'
        }
        loading={<Rows loading />}
        empty={<StateMessage>No releases yet</StateMessage>}
        error={<StateMessage>Releases could not be loaded</StateMessage>}
        status={
          <span className='rounded-full bg-surface-2 px-2 py-1 text-xs text-secondary-token'>
            Updating
          </span>
        }
        minHeightClassName='min-h-[168px]'
      >
        <Rows refreshing={state === 'refreshing'} />
      </SurfaceState>
    </div>
  );
}

const meta = {
  title: 'UI/Molecules/SurfaceState',
  component: SurfaceState,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SurfaceState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StateMatrix: Story = {
  render: () => (
    <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
      {surfaceStates.map(state => (
        <SurfaceFixture key={state} state={state} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const frames = Array.from(
      canvasElement.querySelectorAll<HTMLElement>(
        '[data-slot="surface-state-frame"]'
      )
    );
    const rects = frames.map(frame => frame.getBoundingClientRect());

    await expect(frames).toHaveLength(surfaceStates.length);
    await expect(new Set(rects.map(rect => Math.round(rect.height))).size).toBe(
      1
    );
    await expect(new Set(rects.map(rect => Math.round(rect.width))).size).toBe(
      1
    );
  },
};
