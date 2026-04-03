'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import Image from 'next/image';
import type { AlbumArtGenerationResult } from '@/lib/services/album-art/types';
import { cn } from '@/lib/utils';
import { AlbumArtGenerateButton } from './AlbumArtGenerateButton';

interface AlbumArtBrandKitOption {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
}

interface AlbumArtOptionPickerProps {
  readonly title: string;
  readonly description: string;
  readonly result: AlbumArtGenerationResult | null;
  readonly selectedOptionId: string | null;
  readonly onSelectOption: (optionId: string) => void;
  readonly onGenerate: () => void;
  readonly onUseMatching?: (() => void) | null;
  readonly onUseSeriesTemplate?: (() => void) | null;
  readonly onApply?: (() => void) | null;
  readonly onRegenerate?: (() => void) | null;
  readonly onCancel?: (() => void) | null;
  readonly isGenerating?: boolean;
  readonly isApplying?: boolean;
  readonly quotaRemaining?: number | null;
  readonly brandKitOptions?: readonly AlbumArtBrandKitOption[];
  readonly selectedBrandKitId?: string | null;
  readonly onSelectBrandKit?: ((brandKitId: string) => void) | null;
}

export function AlbumArtOptionPicker({
  title,
  description,
  result,
  selectedOptionId,
  onSelectOption,
  onGenerate,
  onUseMatching,
  onUseSeriesTemplate,
  onApply,
  onRegenerate,
  onCancel,
  isGenerating = false,
  isApplying = false,
  quotaRemaining = null,
  brandKitOptions = [],
  selectedBrandKitId = null,
  onSelectBrandKit = null,
}: AlbumArtOptionPickerProps) {
  const hasOptions = Boolean(result && result.options.length > 0);
  const showBrandKitSelector =
    !hasOptions &&
    Boolean(onUseSeriesTemplate) &&
    brandKitOptions.length > 1 &&
    Boolean(selectedBrandKitId) &&
    Boolean(onSelectBrandKit);
  const selectedBrandKitName =
    brandKitOptions.find(option => option.id === selectedBrandKitId)?.name ??
    'Select a template';

  return (
    <div className='rounded-[14px] border border-subtle bg-surface-0 p-3'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-[13px] font-[560] text-primary-token'>{title}</p>
          <p className='mt-1 text-[12px] text-secondary-token'>{description}</p>
          {quotaRemaining !== null ? (
            <p className='mt-1 text-[11px] text-tertiary-token'>
              {quotaRemaining > 0
                ? `${quotaRemaining} run${quotaRemaining === 1 ? '' : 's'} left for this release`
                : 'No runs left for this release'}
            </p>
          ) : null}
          {showBrandKitSelector ? (
            <div className='mt-2 flex max-w-[240px] flex-col gap-1'>
              <p className='text-[11px] font-[520] text-tertiary-token'>
                Series Template
              </p>
              <Select
                value={selectedBrandKitId ?? undefined}
                onValueChange={value => onSelectBrandKit?.(value)}
              >
                <SelectTrigger className='h-[30px] rounded-[8px] border-subtle bg-surface-0 text-[12px]'>
                  <SelectValue>{selectedBrandKitName}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {brandKitOptions.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.isDefault
                        ? `${option.name} (Default)`
                        : option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {!hasOptions ? (
          <div className='flex flex-wrap gap-2'>
            {onUseMatching ? (
              <AlbumArtGenerateButton
                label='Use Matching Design'
                onClick={onUseMatching}
                isLoading={isGenerating}
              />
            ) : null}
            {onUseSeriesTemplate ? (
              <AlbumArtGenerateButton
                label='Use Series Template'
                onClick={onUseSeriesTemplate}
                isLoading={isGenerating}
              />
            ) : null}
            <AlbumArtGenerateButton
              label='Generate Cover'
              onClick={onGenerate}
              variant='primary'
              isLoading={isGenerating}
            />
          </div>
        ) : null}
      </div>

      {hasOptions ? (
        <>
          <div className='mt-3 grid grid-cols-3 gap-2'>
            {result?.options.map(option => (
              <button
                key={option.id}
                type='button'
                onClick={() => onSelectOption(option.id)}
                className={cn(
                  'relative overflow-hidden rounded-[12px] border transition-colors',
                  selectedOptionId === option.id
                    ? 'border-primary-token'
                    : 'border-subtle hover:border-default'
                )}
              >
                <div className='relative aspect-square w-full'>
                  <Image
                    src={option.previewUrl}
                    alt='Generated album art option'
                    fill
                    sizes='(max-width: 768px) 33vw, 160px'
                    className='object-cover'
                    unoptimized
                  />
                </div>
              </button>
            ))}
          </div>
          <div className='mt-3 flex flex-wrap gap-2'>
            {onApply ? (
              <AlbumArtGenerateButton
                label='Apply'
                onClick={onApply}
                variant='primary'
                isLoading={isApplying}
              />
            ) : null}
            {onRegenerate ? (
              <AlbumArtGenerateButton
                label='Regenerate'
                onClick={onRegenerate}
                isLoading={isGenerating}
              />
            ) : null}
            {onCancel ? (
              <AlbumArtGenerateButton label='Cancel' onClick={onCancel} />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
