'use client';

import { useEffect } from 'react';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';
import { captureErrorInSentry } from '@/lib/errors/capture';
import { SystemBErrorFallback } from './SystemBErrorFallback';

interface PublicPageErrorFallbackProps {
  readonly error: Error & { digest?: string };
  readonly context: string;
  readonly onRefresh?: () => void;
}

export function PublicPageErrorFallback({
  error,
  context,
  onRefresh = () => globalThis.location.reload(),
}: PublicPageErrorFallbackProps) {
  useEffect(() => {
    console.error(`[${context} Error]`, error);
    captureErrorInSentry(error, context, { digest: error.digest });
  }, [context, error]);

  return (
    <SystemBErrorFallback
      description='Try refreshing the page.'
      digest={error.digest}
      actions={[
        { type: 'button', label: RECOVERY_COPY.retryLabel, onClick: onRefresh },
      ]}
      role='alert'
      ariaLive='assertive'
    />
  );
}
