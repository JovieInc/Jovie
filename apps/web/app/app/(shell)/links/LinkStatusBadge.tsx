import { cn } from '@/lib/utils';
import type { LinkRow } from './links-model';

const STATUS_LABELS: Record<LinkRow['status'], string> = {
  active: 'Active',
  draft: 'Draft',
  scheduled: 'Scheduled',
  archived: 'Archived',
};

export function LinkStatusBadge({
  status,
}: {
  readonly status: LinkRow['status'];
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs',
        status === 'active' && 'bg-surface-2 text-primary-token',
        status === 'archived' && 'bg-surface-1 text-tertiary-token',
        (status === 'draft' || status === 'scheduled') &&
          'bg-surface-1 text-secondary-token'
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
