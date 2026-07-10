'use client';

import { Button } from '@jovie/ui';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Shirt,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { MerchPricingPresetPicker } from '@/components/molecules/MerchPricingPresetPicker';
import { MerchPricingSummary } from '@/components/molecules/MerchPricingSummary';
import { accentVar } from '@/components/organisms/entity-card/kind-presets';
import type { EntityAccent } from '@/components/organisms/entity-card/types';
import {
  hasRenderableMockup,
  isInternalMerchMockupUrl,
  isPrintfulMockupUrl,
  selectPreferredMockupUrl,
} from '@/lib/merch/mockup-urls';
import type { MerchMarginPreset } from '@/lib/merch/pricing';
import { MERCH_DEFAULT_MARGIN_PRESET } from '@/lib/merch/pricing';
import { cn } from '@/lib/utils';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';
import { ChatMerchActionCard } from './ChatMerchActionCard';

// Rotate the studio ambient-glow accent across generated options so the bento
// grid reads as one card family with the public-profile EntityCard.
const OPTION_ACCENTS: readonly EntityAccent[] = [
  'purple',
  'blue',
  'green',
  'orange',
  'pink',
  'teal',
];

interface MerchGenerationOption {
  readonly id: string;
  readonly option_number: number;
  readonly design_name: string;
  readonly product_type: string;
  readonly printful_product_name?: string;
  readonly colorway?: string;
  readonly available_sizes?: readonly string[];
  readonly price_recommendation?: {
    readonly sale_price?: string;
    readonly profit?: string;
    readonly margin_preset?: MerchMarginPreset;
    readonly presets?: readonly {
      readonly preset: MerchMarginPreset;
      readonly label: string;
      readonly sale_price: string;
      readonly profit: string;
    }[];
    readonly estimated_printful_cost?: string;
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

interface MerchPublishProposal {
  readonly success: true;
  readonly action: 'publish_merch';
  readonly merchCardId: string;
  readonly title: string;
  readonly currentStatus: string;
  readonly retailPrice: string;
}

export interface ChatMerchSelectionResult {
  readonly success: true;
  readonly merchCardId: string;
  readonly status: string;
  readonly selectedOptionId: string;
  readonly title: string;
  readonly publicUrl: string | null;
  readonly publishBlockedReasons?: readonly string[];
  readonly publishProposal?: MerchPublishProposal;
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

function alternativeItemPrompt(merchCardId: string, itemType: string): string {
  return `Create a ${itemType} version of merch card ${merchCardId} with the same design.`;
}

function MerchOptionPricing({
  recommendation,
}: {
  readonly recommendation: MerchGenerationOption['price_recommendation'];
}) {
  const presetOptions = useMemo(
    () =>
      (recommendation?.presets ?? []).map(preset => ({
        preset: preset.preset,
        label: preset.label,
        salePrice: preset.sale_price,
        profit: preset.profit,
      })),
    [recommendation?.presets]
  );
  const [selectedPreset, setSelectedPreset] = useState<MerchMarginPreset>(
    recommendation?.margin_preset ?? MERCH_DEFAULT_MARGIN_PRESET
  );
  const activeQuote = useMemo(() => {
    const selected = presetOptions.find(
      option => option.preset === selectedPreset
    );
    if (selected) return selected;
    return {
      preset: MERCH_DEFAULT_MARGIN_PRESET,
      label: 'Standard',
      salePrice: recommendation?.sale_price ?? '$0.00',
      profit: recommendation?.profit ?? '$0.00',
    };
  }, [
    presetOptions,
    recommendation?.profit,
    recommendation?.sale_price,
    selectedPreset,
  ]);

  if (!recommendation?.sale_price && !recommendation?.profit) {
    return null;
  }

  return (
    <div className='space-y-1.5'>
      {presetOptions.length > 1 ? (
        <MerchPricingPresetPicker
          options={presetOptions}
          value={selectedPreset}
          onChange={setSelectedPreset}
        />
      ) : null}
      <MerchPricingSummary
        salePrice={activeQuote.salePrice}
        profit={activeQuote.profit}
      />
    </div>
  );
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
      className='max-w-160'
    >
      <div className='grid gap-2.5 md:grid-cols-3'>
        {result.options.map(option => {
          const mockupUrls = option.mockup_urls ?? [];
          const imageUrl = selectPreferredMockupUrl(mockupUrls);
          const productLabel =
            option.printful_product_name ?? option.product_type;
          const mockupPending =
            hasRenderableMockup(mockupUrls) &&
            mockupUrls.every(url => isInternalMerchMockupUrl(url)) &&
            !mockupUrls.some(isPrintfulMockupUrl);
          const sellable = option.sellability?.sellable ?? true;
          const blockedReasons = option.sellability?.reasons ?? [];
          const accent =
            OPTION_ACCENTS[(option.option_number - 1) % OPTION_ACCENTS.length];
          return (
            <article
              key={option.id}
              data-testid='chat-merch-option-card'
              className='flex min-w-0 flex-col gap-2.5 rounded-xl border border-subtle bg-surface-1 p-2.5 shadow-card'
            >
              <div
                className='relative aspect-square overflow-hidden rounded-lg border border-subtle'
                style={{
                  background: `radial-gradient(120% 120% at 32% 22%, color-mix(in oklab, ${accentVar(accent)} 22%, transparent), transparent 62%), linear-gradient(155deg, var(--color-bg-surface-2), var(--color-bg-surface-1))`,
                }}
              >
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={`${option.design_name} mockup`}
                    fill
                    sizes='180px'
                    className='object-cover'
                    unoptimized
                  />
                ) : (
                  <div
                    data-testid='chat-merch-mockup-fallback'
                    className='flex h-full w-full flex-col items-center justify-center gap-2 text-tertiary-token'
                  >
                    <Loader2
                      className='h-7 w-7 animate-spin'
                      strokeWidth={1.8}
                    />
                    <span className='text-3xs font-medium'>
                      Rendering mockup
                    </span>
                  </div>
                )}
                {mockupPending ? (
                  <div className='absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/45 px-2 py-1.5 text-3xs font-medium text-white dark:text-white backdrop-blur'>
                    <Loader2 className='h-3 w-3 animate-spin' strokeWidth={2} />
                    Photorealistic preview pending
                  </div>
                ) : null}
                <div className='absolute left-2 top-2'>
                  <span className='rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 text-3xs font-medium text-white dark:text-white backdrop-blur'>
                    Option {option.option_number}
                  </span>
                </div>
              </div>
              <div className='flex flex-1 flex-col gap-2'>
                <div className='min-w-0'>
                  <h3 className='truncate text-app font-semibold text-primary-token'>
                    {option.design_name}
                  </h3>
                  <p className='mt-0.5 truncate text-2xs text-tertiary-token'>
                    {productLabel}
                    {option.colorway ? ` - ${option.colorway}` : ''}
                  </p>
                </div>
                <p className='line-clamp-3 min-h-14 text-2xs leading-[18px] text-secondary-token'>
                  {option.concept}
                </p>
                <MerchOptionPricing
                  recommendation={option.price_recommendation}
                />
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
                {blockedReasons.length ? (
                  <p className='flex min-h-8 items-start gap-1.5 text-3xs leading-4 text-tertiary-token'>
                    <AlertTriangle className='mt-0.5 h-3 w-3 shrink-0' />
                    <span className='line-clamp-2'>
                      {blockedReasons.join(' ')}
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
  profileId,
}: {
  readonly result: ChatMerchSelectionResult;
  readonly profileId?: string;
}) {
  const statusLabel =
    result.status.slice(0, 1).toUpperCase() + result.status.slice(1);
  const blockedReasons = result.publishBlockedReasons ?? [];
  const handleAlternativeItem = useCallback(
    (itemType: string) => {
      submitMerchPrompt(alternativeItemPrompt(result.merchCardId, itemType));
    },
    [result.merchCardId]
  );

  return (
    <ChatGenerationArtifactSurface
      title={result.title}
      subtitle='Saved to Library'
    >
      <div
        data-testid='chat-merch-selection-card'
        className='flex items-start gap-3 rounded-lg border border-subtle bg-surface-0 p-3'
      >
        <span className='grid h-9 w-9 shrink-0 place-items-center rounded-md bg-success-subtle text-success'>
          <CheckCircle2 className='h-4 w-4' strokeWidth={2.25} />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-app font-semibold text-primary-token'>
            Merch card created
          </p>
          <p className='mt-0.5 text-xs leading-5 text-secondary-token'>
            {blockedReasons.length
              ? `${statusLabel} card is in Library as a draft until Printful and pricing checks pass.`
              : `${statusLabel} card is now available in Library.`}
          </p>
          {blockedReasons.length ? (
            <p className='mt-1.5 line-clamp-2 text-2xs leading-4 text-tertiary-token'>
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
            <Button
              type='button'
              size='sm'
              variant='secondary'
              className='h-8 gap-1.5'
              onClick={() => handleAlternativeItem('hoodie')}
            >
              <Shirt className='h-3 w-3' />
              Hoodie
            </Button>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              className='h-8 gap-1.5'
              onClick={() => handleAlternativeItem('hat')}
            >
              <Shirt className='h-3 w-3' />
              Hat
            </Button>
          </div>
        </div>
      </div>
      {profileId && result.publishProposal?.success ? (
        <div className='mt-3'>
          <ChatMerchActionCard
            profileId={profileId}
            merchCardId={result.publishProposal.merchCardId}
            action='publish'
            title={result.publishProposal.title}
            currentStatus={result.publishProposal.currentStatus}
            retailPrice={result.publishProposal.retailPrice}
            nested
          />
        </div>
      ) : null}
    </ChatGenerationArtifactSurface>
  );
}
