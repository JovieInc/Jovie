'use client';

import type { FallbackProps } from 'react-error-boundary';
import { toast } from 'sonner';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';

export function TableErrorFallbackWithDetails(props: FallbackProps) {
  const timestamp = new Date();
  const errorDigest = (props.error as Error & { digest?: string })?.digest;

  const handleCopyErrorDetails = () => {
    const details = [
      `Error ID: ${errorDigest || 'unknown'}`,
      `Time: ${timestamp.toISOString()}`,
      `Context: Table`,
      `URL: ${globalThis.location?.href ?? 'N/A'}`,
      `User Agent: ${globalThis.navigator?.userAgent ?? 'N/A'}`,
    ].join('\n');

    navigator.clipboard
      .writeText(details)
      .then(() => {
        toast.success('Error details copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy error details');
      });
  };

  return (
    <TableErrorFallback
      {...props}
      errorDigest={errorDigest}
      timestampISO={timestamp.toISOString()}
      onCopyErrorDetails={handleCopyErrorDetails}
    />
  );
}
