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

const meta = {
  title: 'Design System/Content Rows',
  component: Stacked,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Stacked>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Fleet, Shipping and Tasks rows stacked: default, hover, selected, attention. */
export const StackedRows: Story = {};
