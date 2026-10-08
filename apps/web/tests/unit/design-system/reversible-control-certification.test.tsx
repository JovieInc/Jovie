import { TooltipProvider } from '@jovie/ui';
import { render as renderUI, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button/SidebarCollapseButton';
import { SidebarProvider, useSidebar } from '@/components/organisms/sidebar';
import {
  certifyReversibleControl,
  type ReversibleControlDriver,
  type ReversibleInput,
  reversibleSequences,
} from '../../helpers/reversible-control';

/**
 * JOV-7713 / JOV-7207: reversible shell controls are certified across their
 * transition graph. The neighbor (real SidebarProvider + SidebarCollapseButton
 * + bare `[` shortcut + cookie persistence) must stay GREEN; each deliberate
 * red replays one escaped shape and must turn the detector RED.
 */

vi.mock('@/hooks/useBreakpoint', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBreakpoint')>()),
  useBreakpointDown: () => false,
}));

type OpenState = 'open' | 'closed';
const render = (ui: ReactNode) =>
  renderUI(<TooltipProvider>{ui}</TooltipProvider>);
const TOGGLE_NAME = /^(collapse|expand) sidebar$/i;

function driverFor(
  renderTree: () => ReactNode,
  inputs: readonly ReversibleInput[] = ['pointer', 'keyboard', 'shortcut'],
  controlName: RegExp = TOGGLE_NAME
): ReversibleControlDriver<OpenState> {
  const user = userEvent.setup();
  let view = render(renderTree());
  return {
    states: ['open', 'closed'],
    inputs,
    readState: () =>
      screen.getByTestId('rail-owner').dataset.state as OpenState,
    controls: () =>
      screen.queryAllByRole('button', { name: controlName, hidden: true }),
    ariaFor: state => ({ 'aria-expanded': String(state === 'open') }),
    async activate(input, control) {
      if (input === 'pointer') await user.click(control);
      else if (input === 'keyboard') {
        control.focus();
        await user.keyboard('{Enter}');
      } else await user.keyboard('[[');
    },
    async remount() {
      view.unmount();
      view = render(renderTree());
    },
  };
}

function RealSidebarOwner() {
  const { state } = useSidebar();
  return (
    <div data-testid='rail-owner' data-state={state}>
      <SidebarCollapseButton />
    </div>
  );
}

const realSidebar = () => (
  <SidebarProvider>
    <RealSidebarOwner />
  </SidebarProvider>
);

type Defect =
  | 'one-way'
  | 'double-bound'
  | 'hidden-when-closed'
  | 'split-instances'
  | 'static-aria'
  | 'not-persisted';

function DefectiveRail({ defect }: { readonly defect: Defect }) {
  const [open, setOpen] = useState(true);
  const toggle = () =>
    setOpen(value => (defect === 'one-way' ? false : !value));
  const button = (slot: string) => (
    <RailToggleButton
      side='left'
      open={defect === 'static-aria' ? true : open}
      openLabel='Collapse sidebar'
      closedLabel='Expand sidebar'
      onToggle={toggle}
      dataTestId={slot}
    />
  );
  const state = open ? 'open' : 'closed';
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: double-bound fixture
    // biome-ignore lint/a11y/useKeyWithClickEvents: double-bound fixture
    <div
      data-testid='rail-owner'
      data-state={state}
      onClick={defect === 'double-bound' ? toggle : undefined}
    >
      {defect === 'split-instances' ? (
        open ? (
          <aside>{button('sidebar-slot')}</aside>
        ) : (
          <header>{button('header-slot')}</header>
        )
      ) : defect === 'hidden-when-closed' ? (
        <div hidden={!open}>{button('rail')}</div>
      ) : (
        button('rail')
      )}
    </div>
  );
}

describe('reversible control certification (JOV-7713)', () => {
  beforeEach(() => {
    document.cookie = 'sidebar:state=; path=/; max-age=0';
  });

  it('plans repeated per-input cycles plus one mixed-input sequence', () => {
    const plan = reversibleSequences(['pointer', 'keyboard', 'shortcut']);
    expect(plan).toHaveLength(4);
    expect(plan[0]).toEqual(['pointer', 'pointer', 'pointer', 'pointer']);
    expect(new Set(plan[3])).toEqual(
      new Set(['pointer', 'keyboard', 'shortcut'])
    );
    expect(reversibleSequences(['pointer'], 3)).toEqual([
      Array.from({ length: 6 }, () => 'pointer'),
    ]);
  });

  it('certifies the real sidebar toggle across pointer, keyboard, shortcut and remount', async () => {
    expect(
      await certifyReversibleControl(
        driverFor(
          realSidebar,
          ['pointer', 'keyboard', 'shortcut'],
          /^(collapse|expand|close) sidebar$/i
        )
      )
    ).toEqual([]);
    expect(
      screen.getByRole('button', { name: 'Close sidebar' })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(document.cookie).toContain('sidebar:state=false');
  });

  it.each<[Defect, ReversibleInput[], string]>([
    ['one-way', ['pointer'], 'no-transition'],
    ['double-bound', ['pointer'], 'no-transition'],
    ['hidden-when-closed', ['pointer'], 'control-unreachable'],
    ['split-instances', ['keyboard'], 'focus-lost'],
    ['static-aria', ['pointer'], 'aria-desync'],
    ['not-persisted', ['pointer'], 'remount-state-lost'],
  ])(
    'deliberate red: %s control fails with %s',
    async (defect, inputs, code) => {
      const violations = await certifyReversibleControl(
        driverFor(() => <DefectiveRail defect={defect} />, inputs),
        { cycles: 1 }
      );
      expect(violations.map(violation => violation.code)).toContain(code);
    }
  );

  it('deliberate red: a one-way toggle still passes a single-click test', async () => {
    const user = userEvent.setup();
    render(<DefectiveRail defect='one-way' />);
    await user.click(screen.getByRole('button', { name: TOGGLE_NAME }));
    expect(screen.getByTestId('rail-owner').dataset.state).toBe('closed');
  });
});
