'use client';

import { useEffect } from 'react';
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
      actions={[{ type: 'button', label: 'Refresh', onClick: onRefresh }]}
      role='alert'
      ariaLive='assertive'
    />
  );
}
