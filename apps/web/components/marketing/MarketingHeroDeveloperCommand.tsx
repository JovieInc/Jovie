'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Check, Copy } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';

interface MarketingHeroDeveloperCommandProps {
  readonly command: string;
  readonly copyLabel: string;
  readonly copiedLabel: string;
  readonly errorLabel: string;
  readonly availabilityNote: string;
}

export function MarketingHeroDeveloperCommand({
  command,
  copyLabel,
  copiedLabel,
  errorLabel,
  availabilityNote,
}: MarketingHeroDeveloperCommandProps) {
  const { copy, isSuccess, isError } = useClipboard();
  const statusLabel = isSuccess ? copiedLabel : isError ? errorLabel : '';

  return (
    <div className='mt-6 flex flex-wrap items-center gap-3'>
      <code className='rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-sm text-secondary-token'>
        {command}
      </code>
      <Button
        type='button'
        size='sm'
        variant='secondary'
        onClick={() => void copy(command)}
        aria-label={copyLabel}
      >
        {isSuccess ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
        {copyLabel}
      </Button>
      <span role='status' aria-live='polite' className='sr-only'>
        {statusLabel}
      </span>
      <span className='text-xs text-tertiary-token'>{availabilityNote}</span>
    </div>
  );
}
