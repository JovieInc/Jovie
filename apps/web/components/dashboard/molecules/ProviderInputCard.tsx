'use client';

import { Badge, Button, Input } from '@jovie/ui';
import type { ProviderListItem } from '@/components/dashboard/hooks/useReleaseProviderMatrix';

export interface ProviderInputCardProps {
  provider: ProviderListItem;
  value: string;
  existingSource?: 'manual' | 'ingested';
  existingUrl?: string | null;
  releaseId: string;
  isSaving: boolean;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
}

export function ProviderInputCard({
  provider,
  value,
  existingSource,
  existingUrl,
  releaseId,
  isSaving,
  onValueChange,
  onSave,
  onReset,
}: ProviderInputCardProps) {
  const helperText =
    existingSource === 'manual'
      ? 'Manual override active'
      : existingUrl
        ? 'Detected automatically'
        : 'No link yet';

  return (
    <div className='rounded-lg border border-subtle bg-surface-1 p-3 shadow-sm'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <span
            className='block h-2.5 w-2.5 rounded-full'
            style={{ backgroundColor: provider.accent }}
            aria-hidden='true'
          />
          <p className='text-sm font-semibold text-primary-token'>
            {provider.label}
          </p>
        </div>
        {existingSource === 'manual' ? (
          <Badge
            variant='secondary'
            className='border border-amber-200 bg-amber-50 text-[10px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'
          >
            Manual
          </Badge>
        ) : null}
      </div>
      <p className='mt-1 text-xs text-secondary-token'>{helperText}</p>
      <div className='mt-2 space-y-2'>
        <Input
          value={value}
          onChange={event => onValueChange(event.target.value)}
          placeholder={`${provider.label} URL`}
          data-testid={`provider-input-${releaseId}-${provider.key}`}
        />
        <div className='flex items-center justify-between gap-2'>
          <Button
            variant='primary'
            size='sm'
            disabled={isSaving || !value.trim()}
            data-testid={`save-provider-${releaseId}-${provider.key}`}
            onClick={onSave}
          >
            Save
          </Button>
          <Button
            variant='ghost'
            size='sm'
            disabled={isSaving}
            data-testid={`reset-provider-${releaseId}-${provider.key}`}
            onClick={onReset}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
