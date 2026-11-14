import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useReducer } from 'react';
import { fn } from 'storybook/test';
import {
  DESKTOP_UPDATE_CONTROL_HIDDEN,
  type DesktopUpdateControlAction,
  type DesktopUpdateControlState,
  reduceDesktopUpdateControl,
} from '@/lib/desktop/desktop-update-control-state';
import type { DesktopUpdateViewState } from '@/lib/desktop/desktop-updates';
import { DesktopUpdateControl } from './DesktopUpdateControl';

const VERSION = '26.11.12';

const STATES = [
  ['Checking', { kind: 'checking' }],
  ['Available', { kind: 'available', version: VERSION }],
  ['Downloading', { kind: 'downloading', version: VERSION, percent: 100 }],
  ['Ready', { kind: 'ready', version: VERSION }],
  ['Restarting', { kind: 'restarting', version: VERSION }],
  ['Failed', { kind: 'failed', retry: 'check', version: VERSION }],
  ['Restart failed', { kind: 'failed', retry: 'restart', version: VERSION }],
  ['Offline', { kind: 'offline' }],
] as const satisfies readonly (readonly [string, DesktopUpdateControlState])[];

/** The expanded sidebar's inner width: 224px rail minus its 8px gutters. */
function SidebarSlot({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      data-update-control-slot
      className='w-52 rounded-md border border-subtle bg-sidebar px-2 text-primary-token'
    >
      {children}
    </div>
  );
}

const meta = {
  title: 'Organisms/DesktopUpdateControl',
  component: DesktopUpdateControl,
  parameters: { layout: 'centered' },
  args: {
    state: { kind: 'ready', version: VERSION },
    onDownload: fn(),
    onRestart: fn(),
    onRetry: fn(),
  },
  render: args => (
    <SidebarSlot>
      <DesktopUpdateControl {...args} />
    </SidebarSlot>
  ),
} satisfies Meta<typeof DesktopUpdateControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checking: Story = { args: { state: { kind: 'checking' } } };
export const Available: Story = {
  args: { state: { kind: 'available', version: VERSION } },
};
export const Downloading: Story = {
  args: { state: { kind: 'downloading', version: VERSION, percent: 42 } },
};
export const Ready: Story = {
  args: { state: { kind: 'ready', version: VERSION } },
};
export const Restarting: Story = {
  args: { state: { kind: 'restarting', version: VERSION } },
};
export const Failed: Story = {
  args: { state: { kind: 'failed', retry: 'check', version: VERSION } },
};
export const RestartFailed: Story = {
  args: { state: { kind: 'failed', retry: 'restart', version: VERSION } },
};
export const Offline: Story = { args: { state: { kind: 'offline' } } };

/** Loading: the updater is checking, so the button morphs into its loader. */
export const LoadingChecking: Story = {
  args: { state: { kind: 'checking' } },
};

/** Empty: nothing to report. The control renders nothing; the host keeps the slot. */
export const EmptyHidden: Story = {
  args: { state: DESKTOP_UPDATE_CONTROL_HIDDEN },
  render: args => (
    <SidebarSlot>
      <div className='h-9'>
        <DesktopUpdateControl {...args} />
      </div>
    </SidebarSlot>
  ),
};

/** Long content: the longest status line in a rail narrower than the sidebar truncates; the button keeps its width. */
export const LongContentNarrowRail: Story = {
  args: { state: { kind: 'downloading', version: VERSION, percent: 100 } },
  render: args => (
    <div className='w-36 rounded-md border border-subtle bg-sidebar px-2 text-primary-token'>
      <DesktopUpdateControl {...args} />
    </div>
  ),
};

/** Right-to-left page: the status line and the action swap sides and nothing overflows. */
export const RtlSlot: Story = {
  render: args => (
    <div dir='rtl'>
      <SidebarSlot>
        <DesktopUpdateControl {...args} />
      </SidebarSlot>
    </div>
  ),
};

function AllStatesGrid() {
  return (
    <div data-update-control-gallery className='flex flex-col gap-2'>
      {STATES.map(([name, state]) => (
        <div key={name} className='flex items-center gap-3'>
          <span className='w-24 text-2xs text-tertiary-token'>{name}</span>
          <SidebarSlot>
            <DesktopUpdateControl
              state={state}
              onDownload={() => undefined}
              onRestart={() => undefined}
              onRetry={() => undefined}
            />
          </SidebarSlot>
        </div>
      ))}
    </div>
  );
}

/** Every state at once, for visual review. Dark is the default theme. */
export const AllStates: Story = {
  render: () => <AllStatesGrid />,
};

export const AllStatesLight: Story = {
  ...AllStates,
  parameters: { themes: { themeOverride: 'light' } },
};

const phase = (value: DesktopUpdateViewState): DesktopUpdateControlAction => ({
  type: 'phase',
  phase: value,
  online: true,
});
const AVAILABLE = phase({
  state: 'available',
  version: VERSION,
  releaseDate: null,
  notesUrl: '/changelog',
});
const progress = (percent: number) =>
  phase({
    state: 'downloading',
    percent,
    transferredBytes: percent,
    totalBytes: 100,
    bytesPerSecond: 1,
  });

/** One scripted run of the real reducer, looping, to judge the transitions. */
const SCRIPT: readonly DesktopUpdateControlAction[] = [
  AVAILABLE,
  progress(4),
  progress(31),
  progress(58),
  phase({
    state: 'error',
    message: 'net::ERR_INTERNET_DISCONNECTED',
    retryable: true,
  }),
  { type: 'connectivity', online: true },
  AVAILABLE,
  progress(58),
  progress(86),
  progress(100),
  phase({ state: 'ready', version: VERSION }),
  { type: 'restart-requested' },
  { type: 'timed-out' },
  { type: 'retry-requested' },
  // A restart only ends by quitting or failing, so fail it before the loop.
  { type: 'timed-out' },
  phase({ state: 'unsupported' }),
];
const STEP_MS = 1400;

function LifecyclePreview() {
  const [{ state }, advance] = useReducer(
    (
      current: { state: DesktopUpdateControlState; step: number },
      _tick: null
    ) => {
      const action = SCRIPT[current.step % SCRIPT.length];
      return {
        state: action
          ? reduceDesktopUpdateControl(current.state, action)
          : current.state,
        step: current.step + 1,
      };
    },
    { state: DESKTOP_UPDATE_CONTROL_HIDDEN, step: 0 }
  );
  useEffect(() => {
    const timer = setInterval(() => advance(null), STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <SidebarSlot>
      {/* The slot keeps its height while the control is hidden. */}
      <div className='h-9'>
        <DesktopUpdateControl
          state={state}
          onDownload={() => undefined}
          onRestart={() => undefined}
          onRetry={() => undefined}
        />
      </div>
    </SidebarSlot>
  );
}

export const Lifecycle: Story = {
  render: () => <LifecyclePreview />,
};
