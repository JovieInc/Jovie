import { Badge } from '@jovie/ui';
import type { CellContext } from '@tanstack/react-table';
import { DateCell } from '@/components/organisms/table';
import type { AdminUserRow } from '@/lib/admin/users';

/**
 * Renders the name cell with name and email
 */
export function renderNameCell({
  getValue,
  row,
}: CellContext<AdminUserRow, string | null>) {
  const user = row.original;
  return (
    <div>
      <div className='font-semibold text-primary-token'>
        {getValue() ?? 'User'}
      </div>
      <div className='text-xs text-secondary-token'>{user.email ?? '—'}</div>
    </div>
  );
}

/**
 * Renders the created date cell
 */
export function renderCreatedDateCell({
  getValue,
}: CellContext<AdminUserRow, Date | null>) {
  return <DateCell date={getValue()} />;
}

/**
 * Renders the plan badge cell
 */
export function renderPlanCell({
  getValue,
}: CellContext<AdminUserRow, string>) {
  const plan = getValue();
  return (
    <Badge size='sm' variant={plan === 'pro' ? 'primary' : 'secondary'}>
      {plan}
    </Badge>
  );
}

/**
 * Renders the status badge cell
 */
export function renderStatusCell({ row }: CellContext<AdminUserRow, unknown>) {
  const user = row.original;
  return user.deletedAt ? (
    <Badge size='sm' variant='warning'>
      Deleted
    </Badge>
  ) : (
    <Badge size='sm' variant='success'>
      <span className='flex items-center gap-1.5'>
        <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400' />{' '}
        Active
      </span>
    </Badge>
  );
}
