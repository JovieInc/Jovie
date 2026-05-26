'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, ExternalLink, Shirt } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';

interface MerchGenerationOption {
  readonly id: string;
  readonly option_number: number;
  readonly design_name: string;
  readonly product_type: string;
  readonly printful_product_name?: string;
  readonly colorway?: string;
  readonly available_sizes?: readonly string[];
  readonly price_recommendation?: {
    readonly retail_price?: string;
    readonly estimated_gross_margin?: string;
    readonly artist_share?: string;
    readonly jovie_share?: string;
    readonly minimum_jovie_margin?: string;
    readonly target_jovie_margin?: string;
  };
  readonly sellability?: {
    readonly sellable: boolean;
    readonly reasons: readonly string[];
  };
  readonly concept: string;
  readonly why_it_fits?: string;
  readonly mockup_urls?: readonly string[];
  readonly production_warnings?: readonly string[];
}

export interface ChatMerchGenerationResult {
  readonly success: true;
  readonly generationId: string;
  readonly prompt?: string;
  readonly nextStep?: string;
  readonly options: readonly MerchGenerationOption[];
}

export interface ChatMerchSelectionResult {
  readonly success: true;
  readonly merchCardId: string;
  readonly status: string;
  readonly selectedOptionId: string;
  readonly title: string;
  readonly publicUrl: string | null;
  readonly publishBlockedReasons?: readonly string[];
}

export function isChatMerchGenerationResult(
  value: unknown
): value is ChatMerchGenerationResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === true &&
    typeof (value as { generationId?: unknown }).generationId === 'string' &&
    Array.isArray((value as { options?: unknown }).options)
  );
}

export function isChatMerchSelectionResult(
  value: unknown
): value is ChatMerchSelectionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === true &&
    typeof (value as { merchCardId?: unknown }).merchCardId === 'string' &&
    typeof (value as { selectedOptionId?: unknown }).selectedOptionId ===
      'string' &&
    typeof (value as { title?: unknown }).title === 'string'
  );
}

function submitMerchPrompt(prompt: string): void {
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-submit-prompt', {
      detail: { prompt },
    })
  );
}

function optionPrompt(
  generationId: string,
  option: MerchGenerationOption,
  publish: boolean
): string {
  const action = publish ? 'Select and publish' : 'Select';
  return `${action} merch option ${option.option_number} from generation ${generationId}.`;
}

export function ChatMerchOptionsCard({
  result,
}: {
  readonly result: ChatMerchGenerationResult;
}) {
  const handleSelect = useCallback(
    (option: MerchGenerationOption, publish: boolean) => {
      submitMerchPrompt(optionPrompt(result.generationId, option, publish));
    },
    [result.generationId]
  );

  return (
    <ChatGenerationArtifactSurface
      title='Merch Options'
      subtitle={result.nextStep ?? 'Pick one to save it to Library'}
      className='max-w-[640px]'
    >
      <div className='grid gap-2.5 md:grid-cols-3'>
        {result.options.map(option => {
          const imageUrl = option.mockup_urls?.[0] ?? null;
          const sellable = option.sellability?.sellable ?? true;
          const blockedReasons = option.sellability?.reasons ?? [];
          return (
            <article
              key={option.id}
              data-testid='chat-merch-option-card'
              className='min-w-0 overflow-hidden rounded-lg border border-subtle bg-surface-0 shadow-sm'
            >
              <div className='relative aspect-square bg-surface-1'>
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt=''
                    fill
                    sizes='180px'
                    className='object-cover'
                    unoptimized
                  />
                ) : (
                  <div className='flex h-full w-full items-center justify-center text-tertiary-token'>
                    <Shirt className='h-9 w-9' strokeWidth={1.8} />
                  </div>
                )}
                <div className='absolute left-2 right-2 top-2 flex items-center justify-between gap-2'>
                  <span className='rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 text-[10.5px] font-medium text-white backdrop-blur'>
                    Option {option.option_number}
                  </span>
                  <span className='rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 text-[10.5px] font-medium text-white backdrop-blur'>
                    {sellable ? 'Ready' : 'Draft'}
                  </span>
                </div>
              </div>
              <div className='space-y-2 p-2.5'>
                <div className='min-w-0'>
                  <h3 className='truncate text-[13px] font-semibold text-primary-token'>
                    {option.design_name}
                  </h3>
                  <p className='mt-0.5 truncate text-[11px] text-tertiary-token'>
                    {option.product_type}
                    {option.colorway ? ` - ${option.colorway}` : ''}
                  </p>
                </div>
                <p className='line-clamp-3 min-h-[54px] text-[11.5px] leading-[18px] text-secondary-token'>
                  {option.concept}
                </p>
                <div className='grid min-h-[58px] grid-cols-2 gap-1'>
                  {option.price_recommendation?.retail_price ? (
                    <span className='rounded-md bg-surface-1 px-1.5 py-1 text-[10.5px] text-secondary-token'>
                      Price {option.price_recommendation.retail_price}
                    </span>
                  ) : null}
                  {option.price_recommendation?.artist_share ? (
                    <span className='rounded-md bg-surface-1 px-1.5 py-1 text-[10.5px] text-secondary-token'>
                      Artist {option.price_recommendation.artist_share}
                    </span>
                  ) : null}
                  {option.price_recommendation?.jovie_share ? (
                    <span className='rounded-md bg-surface-1 px-1.5 py-1 text-[10.5px] text-secondary-token'>
                      Jovie {option.price_recommendation.jovie_share}
                    </span>
                  ) : null}
                  {option.price_recommendation?.minimum_jovie_margin ? (
                    <span className='rounded-md bg-surface-1 px-1.5 py-1 text-[10.5px] text-secondary-token'>
                      Floor {option.price_recommendation.minimum_jovie_margin}
                    </span>
                  ) : null}
                </div>
                <div className='flex flex-wrap gap-1.5 pt-0.5'>
                  <Button
                    type='button'
                    size='sm'
                    onClick={() => handleSelect(option, false)}
                  >
                    Save
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant='secondary'
                    disabled={!sellable}
                    onClick={() => handleSelect(option, true)}
                  >
                    Publish
                  </Button>
                </div>
                {blockedReasons.length || option.production_warnings?.length ? (
                  <p className='flex min-h-8 items-start gap-1.5 text-[10.5px] leading-4 text-tertiary-token'>
                    <AlertTriangle className='mt-0.5 h-3 w-3 shrink-0' />
                    <span className='line-clamp-2'>
                      {[
                        ...blockedReasons,
                        ...(option.production_warnings ?? []),
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </ChatGenerationArtifactSurface>
  );
}

export function ChatMerchSelectionCard({
  result,
}: {
  readonly result: ChatMerchSelectionResult;
}) {
  const statusLabel =
    result.status.slice(0, 1).toUpperCase() + result.status.slice(1);
  const blockedReasons = result.publishBlockedReasons ?? [];

  return (
    <ChatGenerationArtifactSurface
      title={result.title}
      subtitle='Saved to Library'
    >
      <div
        data-testid='chat-merch-selection-card'
        className='flex items-start gap-3 rounded-lg border border-subtle bg-surface-0 p-3'
      >
        <span className='grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cyan-400/[0.08] text-cyan-300'>
          <CheckCircle2 className='h-4 w-4' strokeWidth={2.25} />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-[13px] font-semibold text-primary-token'>
            Merch card created
          </p>
          <p className='mt-0.5 text-[12px] leading-5 text-secondary-token'>
            {blockedReasons.length
              ? `${statusLabel} card is in Library as a draft until Printful and pricing checks pass.`
              : `${statusLabel} card is now available in Library.`}
          </p>
          {blockedReasons.length ? (
            <p className='mt-1.5 line-clamp-2 text-[11px] leading-4 text-tertiary-token'>
              {blockedReasons.join(' ')}
            </p>
          ) : null}
          <div className='mt-2 flex flex-wrap gap-1.5'>
            <Link
              href='/app/library?view=merch'
              className={cn(
                'inline-flex h-8 items-center rounded-md border border-subtle bg-surface-1 px-3 text-xs font-medium text-primary-token transition-[background-color,border-color] duration-subtle hover:border-default hover:bg-surface-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55'
              )}
            >
              Open Library
            </Link>
            {result.publicUrl ? (
              <a
                href={result.publicUrl}
                target='_blank'
                rel='noreferrer'
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-xs font-medium text-primary-token transition-[background-color,border-color] duration-subtle hover:border-default hover:bg-surface-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55'
                )}
              >
                Public Page
                <ExternalLink className='h-3 w-3' />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </ChatGenerationArtifactSurface>
  );
}
