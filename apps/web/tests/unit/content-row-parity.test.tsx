import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShippingMatrix } from '@/app/app/(shell)/admin/shipping/ShippingMatrix';
import { OperationalTasksPanelView } from '@/components/features/admin/hud/OperationalTasksPanel';
import { TaskListRow } from '@/components/features/dashboard/tasks/TaskListRow';
import {
  contentRowType,
  shellListRowClasses,
} from '@/components/organisms/table/atoms/ShellListRowFrame';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import {
  parseShippingCockpitProjection,
  type ShippingCockpitProjection,
} from '@/lib/ovie/shipping-state/client';
import { unknownProjection } from '@/lib/ovie/shipping-state/project';
import type { TaskView } from '@/lib/tasks/types';
import { cn } from '@/lib/utils';

// Content-row parity contract: `.claude/rules/ui.md` "Content rows".
// Fleet, Shipping and Tasks rows must share one recipe. This file renders all
// three and scans source so a hand-rolled row recipe fails CI.

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({
    children,
    surface: _surface,
    ...props
  }: ComponentProps<'section'> & { surface?: string }) => (
    <section {...props}>{children}</section>
  ),
}));

vi.mock('@/features/admin/layout/AdminDetailRail', () => ({
  AdminDetailRail: ({
    children,
    isOpen,
  }: {
    children: ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <aside>{children}</aside> : null),
}));

type Feed = ShippingCockpitProjection['operationalTasks'];
type FeedTask = Feed['tasks'][number];

const SHA = 'ee7401f37e0b324e225751f0d97ce229838ac8b4';

function feedTask(overrides: Partial<FeedTask> = {}): FeedTask {
  return {
    id: 'linear:JOV-1',
    linearIdentifier: 'JOV-1',
    linearUrl: null,
    title: 'Blocked release',
    workflowState: 'blocked',
    priority: 'none',
    attempt: null,
    retryAt: null,
    sourceRevision: SHA,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function projection(tasks: FeedTask[]): ShippingCockpitProjection {
  const timestamp = new Date().toISOString();
  const base = unknownProjection({
    sequence: 1,
    observationTimestamp: timestamp,
    emissionTimestamp: timestamp,
    latencyMs: 10,
    publishing: true,
    lastError: null,
  });
  const parsed = parseShippingCockpitProjection({
    ...base,
    operationalTasks: { ...base.operationalTasks, syncState: 'fresh', tasks },
  });
  if (!parsed) throw new Error('invalid content-row parity fixture');
  return parsed;
}

const task: TaskView = {
  id: 'parity-task',
  taskNumber: 7,
  creatorProfileId: 'profile-1',
  title: 'Tasks row title',
  description: null,
  status: 'in_progress',
  priority: 'high',
  assigneeKind: 'human',
  assigneeUserId: null,
  agentType: null,
  agentStatus: null,
  agentInput: null,
  agentOutput: null,
  agentError: null,
  dueAt: null,
  releaseId: null,
  releaseTitle: null,
  parentTaskId: null,
  category: null,
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  position: 0,
  sourceTemplateId: null,
  metadata: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

function renderFleet(selected: boolean) {
  const fleetFeed: Feed = {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'lane-pull-requests',
    observedAt: '2026-09-01T22:00:00.000Z',
    lastSyncedAt: '2026-09-01T22:00:00.000Z',
    freshnessDeadline: '2026-09-01T22:00:10.000Z',
    tasks: [feedTask({ title: 'Fleet row title' })],
    deltas: [],
  };
  render(
    <RightPanelProvider>
      <OperationalTasksPanelView
        feed={fleetFeed}
        selectedTaskId={selected ? 'linear:JOV-1' : null}
      />
    </RightPanelProvider>
  );
  return screen.getByTestId('operational-task-linear:JOV-1');
}

async function renderShipping(selected: boolean) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify(projection([feedTask({ title: 'Shipping row title' })])),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ShippingMatrix />
    </QueryClientProvider>
  );
  await screen.findByText('Shipping row title');
  if (selected) {
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', {
          name: 'Inspect JOV-1: Shipping row title',
        })
      );
  }
  return screen.getByTestId('shipping-row-JOV-1');
}

// Compare against the merged recipe: tailwind-merge resolves overlapping
// `text-*` tokens, so the rendered set is `cn(recipe)`.
function expectClasses(el: Element, classes: string) {
  for (const token of cn(classes).split(/\s+/)) {
    expect(el, `missing ${token}`).toHaveClass(token);
  }
}

describe('content row parity (Fleet, Shipping, Tasks)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shares one two-line height, inset and type recipe', async () => {
    const fleet = renderFleet(false);
    const shipping = await renderShipping(false);
    render(<TaskListRow task={task} onOpenRelease={vi.fn()} artistName='Tim' />);
    const tasks = screen.getByTestId('task-list-row-parity-task');

    for (const row of [fleet, shipping, tasks]) {
      expect(row, 'standard density, 44px minimum').toHaveClass('min-h-11');
    }
    for (const row of [fleet, tasks]) {
      expect(row).toHaveClass('px-3');
    }
    for (const cell of shipping.querySelectorAll('th, td')) {
      expect(cell, 'table cells use the px-3 inset').toHaveClass('px-3');
    }

    expectClasses(screen.getByText('Fleet row title'), contentRowType.title);
    expectClasses(screen.getByText('Shipping row title'), contentRowType.title);
    expectClasses(screen.getByText('Tasks row title'), contentRowType.title);
    expect(contentRowType.title).toContain('font-medium');
    expect(contentRowType.title).not.toContain('font-semibold');

    expectClasses(
      screen.getByTestId('task-list-row-meta-parity-task'),
      contentRowType.meta
    );
    expectClasses(shipping.querySelector('.text-2xs')!, contentRowType.meta);
    expect(fleet.querySelector('.text-2xs')).not.toBeNull();
    // 16px leading icon slot on every surface that has one.
    expect(fleet.querySelector('svg')).toHaveClass('size-4');
    expect(tasks.querySelector('svg')).toHaveClass('size-4');
  });

  it('paints hover for Fleet and Shipping, and a selected fill distinct from hover', async () => {
    const fleet = renderFleet(false);
    expect(fleet).toHaveClass('system-b-table-row-hover');
    expect(fleet).not.toHaveClass('system-b-table-row-selected');
    cleanup();
    const fleetSelected = renderFleet(true);
    expect(fleetSelected).toHaveClass('system-b-table-row-selected');
    expect(fleetSelected).not.toHaveClass('system-b-table-row-hover');
    cleanup();

    const shipping = await renderShipping(false);
    expect(shipping).toHaveClass('system-b-table-row-hover');
    cleanup();
    const shippingSelected = await renderShipping(true);
    expect(shippingSelected).toHaveClass('system-b-table-row-selected');
    expect(shippingSelected).not.toHaveClass('system-b-table-row-hover');
  });

  it('shows attention as a leading dot, never a tint, border or seam', async () => {
    const shipping = await renderShipping(false);
    expect(
      shipping.querySelector('[data-attention-dot="blocked"]')
    ).not.toBeNull();
    for (const row of [shipping, renderFleet(false)]) {
      expect(row.className).not.toMatch(
        /border-(t|b|l)\b|border-l-2|bg-error|hover:bg-/
      );
    }
  });

  it('exports a tr helper that matches the frame tokens', () => {
    const idle = shellListRowClasses();
    const selected = shellListRowClasses({ isSelected: true });
    expect(idle).toContain('min-h-11');
    expect(idle).toContain('system-b-table-row-hover');
    expect(selected).toContain('system-b-table-row-selected');
    expect(selected).not.toContain('system-b-table-row-hover');
    expect(shellListRowClasses({ density: 'dense' })).toContain('min-h-8');
  });
});

// Source scan: no hand-rolled row recipes in the OV admin tree or row molecules.
const WEB_ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = [
  join(WEB_ROOT, 'app', 'app', '(shell)', 'admin'),
  join(WEB_ROOT, 'components', 'features', 'admin', 'hud'),
  join(WEB_ROOT, 'components', 'organisms', 'table', 'molecules'),
  join(WEB_ROOT, 'components', 'features', 'dashboard', 'tasks'),
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (
      name.endsWith('.tsx') &&
      !/\.(test|stories|certificate|states)\./.test(name)
    )
      out.push(full);
  }
  return out;
}

/** Opening tags of `<tag ...>` with brace depth tracking (arrow `=>` safe). */
export function openingTags(source: string, tag: 'tr' | 'li'): string[] {
  const tags: string[] = [];
  const open = new RegExp(`<${tag}(?=[\\s>])`, 'g');
  for (let match = open.exec(source); match; match = open.exec(source)) {
    let depth = 0;
    let i = match.index + match[0].length;
    for (; i < source.length; i++) {
      const char = source[i];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0) break;
    }
    const inHead =
      source.lastIndexOf('<thead', match.index) >
      source.lastIndexOf('</thead', match.index);
    // Header seams belong to the table header, not to content rows.
    if (!(tag === 'tr' && inHead)) tags.push(source.slice(match.index, i + 1));
  }
  return tags;
}

/** Returns a human-readable violation for a hand-rolled row recipe, or null. */
export function handRolledRowViolation(
  tag: 'tr' | 'li',
  opening: string
): string | null {
  if (/hover:bg-/.test(opening)) return 'hover:bg-* on a row';
  if (tag === 'tr' && /\bborder-(t|b|l-2)\b|\bdivide-/.test(opening))
    return 'border/seam recipe on a table row';
  if (tag === 'tr' && /\b(bg-error-subtle|border-l-)/.test(opening))
    return 'attention tint on a table row';
  return null;
}

describe('content row source scan', () => {
  it('rejects hand-rolled row recipes (proof the scan bites)', () => {
    expect(
      handRolledRowViolation(
        'tr',
        "<tr className='cursor-pointer border-t border-subtle hover:bg-surface-1'>"
      )
    ).not.toBeNull();
    expect(
      handRolledRowViolation('li', "<li className='hover:bg-surface-1'>")
    ).not.toBeNull();
    expect(
      handRolledRowViolation(
        'tr',
        "<tr className={cn('border-l-2 border-l-error bg-error-subtle')}>"
      )
    ).not.toBeNull();
    expect(
      handRolledRowViolation(
        'tr',
        '<tr className={shellListRowClasses({ interactive: false })}>'
      )
    ).toBeNull();
    expect(
      openingTags(
        "<thead><tr className='border-b'></tr></thead><tbody><tr onClick={() => go()} className='border-t'>",
        'tr'
      )
    ).toHaveLength(1);
  });

  it('keeps OV admin and row molecules on the canonical row recipe', () => {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, 'utf8');
        for (const tag of ['tr', 'li'] as const) {
          for (const opening of openingTags(source, tag)) {
            const why = handRolledRowViolation(tag, opening);
            if (why) {
              violations.push(
                `${relative(WEB_ROOT, file)}: ${why}: ${opening.slice(0, 120).replace(/\s+/g, ' ')}`
              );
            }
          }
        }
      }
    }
    expect(
      violations,
      'Rows must use ShellListRowFrame or shellListRowClasses (.claude/rules/ui.md "Content rows")'
    ).toEqual([]);
  });

  it('keeps row molecules on the shared type recipe', () => {
    const molecule = readFileSync(
      join(
        WEB_ROOT,
        'components',
        'organisms',
        'table',
        'molecules',
        'TaskProjectionListRow.tsx'
      ),
      'utf8'
    );
    expect(molecule).toContain('contentRowType.title');
    expect(molecule).not.toMatch(/font-semibold/);
  });
});
