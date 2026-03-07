'use client';

import { Badge } from '@jovie/ui';

const STATUS_VARIANT: Record<
  string,
  'primary' | 'secondary' | 'success' | 'warning' | 'error'
> = {
  queued: 'primary',
  sent: 'success',
  failed: 'error',
  skipped: 'secondary',
  pending_review: 'warning',
};

interface OutreachStatusBadgeProps {
  readonly status: string;
}

export function OutreachStatusBadge({ status }: OutreachStatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
