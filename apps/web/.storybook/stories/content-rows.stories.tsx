import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CircleAlert, Loader2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ShippingRowWork } from '@/app/app/(shell)/admin/shipping/ShippingRowWork';
import {
  contentRowType,
  shellListRowClasses,
} from '@/components/organisms/table/atoms/ShellListRowFrame';
import { TaskProjectionListRow } from '@/components/organisms/table/molecules/TaskProjectionListRow';
import { cn } from '@/lib/utils';

/**
 * Content rows: Fleet, Shipping and Tasks share one row recipe.
 * Contract: `.claude/rules/ui.md` "Content rows". Parity is enforced by
 * `tests/unit/content-row-parity.test.tsx`; the screenshot is
 * `tests/e2e/storybook-content-rows.spec.ts`.
 *
 * Hover cannot be forced with a pseudo-class here, so the "hover" rows paint
 * the hover token directly. The tokens are the ones the frame applies.
 */

type RowState = 'default' | 'hover' | 'selected' | 'attention';
const STATES: readonly RowState[] = [
  'default',
  'hover',
  'selected',
  'attention',
];
const FORCED_HOVER: CSSProperties = { background: 'var(--color-row-hover)' };

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className='mb-6'>
      <h2 className='mb-2 text-2xs font-medium text-tertiary-token'>{title}</h2>
      {children}
    </section>
  );
}

function FleetRow({ state }: { readonly state: RowState }) {
  const blocked = state === 'attention';
  const Icon = blocked ? CircleAlert : Loader2;
  return (
    <div style={state === 'hover' ? FORCED_HOVER : undefined}>
      <TaskProjectionListRow
        testId={`content-row-fleet-${state}`}
        interaction='self'
        isSelected={state === 'selected'}
        leading={
          <Icon
            aria-hidden='true'
            className={cn(
              contentRowType.icon,
              blocked ? 'text-accent-red' : 'text-accent-blue'
            )}
          />
        }
        title='Cache Symphony workspaces on NVMe'
        metadata={
          <div className={cn('mt-px', contentRowType.meta)}>
            {blocked ? 'Blocked' : 'Running'} · JOV-5544 · Attempt 2
          </div>
        }
        actionSlot={
          <Button type='button' variant='ghost' size='sm'>
            Inspect
          </Button>
        }
      />
    </div>
  );
}

function ShippingRow({ state }: { readonly state: RowState }) {
  const attention = state === 'attention' ? 'blocked' : 'ok';
  return (
    <table className='w-full text-left text-xs tabular-nums'>
      <tbody>
        <tr
          data-testid={`content-row-shipping-${state}`}
          className={shellListRowClasses({
            isSelected: state === 'selected',
          })}
          style={state === 'hover' ? FORCED_HOVER : undefined}
        >
          <th scope='row' className='max-w-0 truncate px-3 py-1.5'>
            <ShippingRowWork
              title='Cache Symphony workspaces on NVMe'
              identifier='JOV-5544'
              prNumber={5544}
              attention={attention}
              attentionLabel={attention === 'blocked' ? 'Blocked' : null}
            />
          </th>
          <td className='px-3 py-1.5 whitespace-nowrap'>
            <HudStatusPill
              label={attention === 'blocked' ? 'Blocked' : 'In Review'}
              tone={attention === 'blocked' ? 'bad' : 'neutral'}
            />
          </td>
          <td className='px-3 py-1.5 whitespace-nowrap text-secondary-token'>
            2h ago
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Tasks rows sit in a table that paints hover and selected (frame is inert). */
function TasksRow({ state }: { readonly state: RowState }) {
  return (
    <div
      className={shellListRowClasses({
        isSelected: state === 'selected',
        className: 'h-14 rounded-md',
      })}
      style={state === 'hover' ? FORCED_HOVER : undefined}
    >
      <TaskProjectionListRow
        testId={`content-row-tasks-${state}`}
        leading={
          <Loader2
            aria-hidden='true'
            className={cn(contentRowType.icon, 'text-accent-blue')}
          />
        }
        title='Upload final master to distributor'
        metadata={
          <div className={cn('mt-px', contentRowType.meta)}>
            In progress · J-12 · High
          </div>
        }
      />
    </div>
  );
}

function Stacked() {
  return (
    <div
      data-testid='content-rows-stack'
      className='w-[640px] bg-(--app-shell-content-surface) p-6'
    >
      <Section title='Fleet (Operational Tasks)'>
        {STATES.map(state => (
          <FleetRow key={state} state={state} />
        ))}
      </Section>
      <Section title='Shipping (In-flight Work)'>
        {STATES.map(state => (
          <ShippingRow key={state} state={state} />
        ))}
      </Section>
      <Section title='Tasks (attention is the same dot or pill tone)'>
        {STATES.slice(0, 3).map(state => (
          <TasksRow key={state} state={state} />
        ))}
      </Section>
    </div>
  );
}

/**
 * What main shipped before this contract, reproduced class for class so the
 * drift stays visible: Fleet had no hover, selected or height; Shipping was a
 * hand-rolled table row with seams and a red tint; Tasks used a heavier title.
 * Never copy these recipes into product code.
 */
function LegacyStacked() {
  const title = 'Cache Symphony workspaces on NVMe';
  return (
    <div
      data-testid='content-rows-before-stack'
      className='w-[640px] bg-(--app-shell-content-surface) p-6'
    >
      <Section title='Fleet (before)'>
        <div className='grid gap-1'>
          {['Running', 'Running', 'Running', 'Blocked'].map((label, i) => (
            <div
              key={`${label}-${i}`}
              className='flex items-center gap-2 rounded-md px-3 py-1'
            >
              <Loader2
                aria-hidden='true'
                className='h-4 w-4 text-accent-blue'
              />
              <div className='min-w-0 flex-1'>
                <div className='text-app font-semibold leading-tight'>
                  {title}
                </div>
                <div className='text-3xs leading-4 text-tertiary-token'>
                  {label} · JOV-5544 · Attempt 2
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title='Shipping (before)'>
        <table className='w-full text-left text-xs tabular-nums'>
          <tbody>
            {[false, true, true, false].map((selected, i) => (
              <tr
                key={`ship-${i}`}
                className={cn(
                  'border-t border-subtle',
                  selected && 'bg-surface-1',
                  i === 3 && 'border-l-2 border-l-error bg-error-subtle'
                )}
              >
                <th scope='row' className='p-2 font-medium'>
                  {title}
                  <div className='text-2xs text-tertiary-token'>JOV-5544</div>
                </th>
                <td className='p-2'>{i === 3 ? 'Blocked' : 'In Review'}</td>
                <td className='p-2 text-secondary-token'>2h ago</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

const meta = {
  title: 'Design System/Content Rows',
  component: Stacked,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Stacked>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Fleet, Shipping and Tasks rows stacked: default, hover, selected, attention. */
export const StackedRows: Story = {};

/** The row recipes main shipped before the contract. */
export const BeforeUnification: Story = { render: () => <LegacyStacked /> };
