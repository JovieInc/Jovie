'use client';

import { SystemBErrorFallback } from '@/components/providers/SystemBErrorFallback';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';
import type { ErrorProps } from '@/types/common';

export default function RootError({ error, reset }: ErrorProps) {
  return (
    <SystemBErrorFallback
      description='An unexpected error occurred.'
      digest={error.digest}
      actions={[
        { type: 'button', label: RECOVERY_COPY.retryLabel, onClick: reset },
        { type: 'link', label: 'Go Home', href: '/', variant: 'secondary' },
      ]}
    />
  );
}
