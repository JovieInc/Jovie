'use client';

import { Button } from '@jovie/ui';
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { type KeyboardEvent, useCallback, useEffect, useState } from 'react';
import { ThreadImageCard } from '@/components/shell/ThreadImageCard';
import type {
  MerchDesignCarouselResult,
  MerchDesignPreview,
} from '@/lib/merch/types';
import {
  type ConfirmChatMerchProductsResponse,
  type ConfirmChatMerchSelectResponse,
  useConfirmChatMerchActionMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

export function isChatMerchDesignCarouselResult(
  value: unknown
): value is MerchDesignCarouselResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === true &&
    typeof (value as { generationId?: unknown }).generationId === 'string' &&
    Array.isArray((value as { designs?: unknown }).designs)
  );
}

function submitMerchPrompt(prompt: string): void {
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-submit-prompt', { detail: { prompt } })
  );
}

function usePrompt(design: MerchDesignPreview): string {
  return `Use concept ${design.option_number}.`;
}

function isSelectionResponse(
  value: unknown
): value is ConfirmChatMerchSelectResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { selectedOptionId?: unknown }).selectedOptionId ===
      'string' &&
    typeof (value as { product?: unknown }).product === 'object'
  );
}

function isProductsResponse(
  value: unknown
): value is ConfirmChatMerchProductsResponse {
  const products =
    typeof value === 'object' && value !== null
      ? (value as { products?: unknown }).products
      : null;
  return (
    Array.isArray(products) &&
    products.every(
      product =>
        typeof product === 'object' &&
        product !== null &&
        typeof (product as { catalogProductId?: unknown }).catalogProductId ===
          'number' &&
        (product as { catalogProductId: number }).catalogProductId > 0 &&
        typeof (product as { productName?: unknown }).productName ===
          'string' &&
        typeof (product as { productType?: unknown }).productType ===
          'string' &&
        typeof (product as { colorway?: unknown }).colorway === 'string'
    )
  );
}

/**
 * Start all concept previews together after the tool result arrives. The
 * browser owns request deduplication; this prevents arrow navigation from
 * becoming a second image-loading wait without changing the image provider's
 * work or URL provenance.
 */
export function prefetchMerchDesignPreviews(
  designs: readonly MerchDesignPreview[]
): void {
  if (typeof globalThis.Image === 'undefined') return;

  const urls = new Set(
    designs.flatMap(design =>
      design.status === 'ready' && design.preview_url
        ? [design.preview_url]
        : []
    )
  );
  for (const url of urls) {
    const image = new globalThis.Image();
    image.decoding = 'async';
    image.src = url;
  }
}

/**
 * The running tool reserves the same three-up media area that the chooser
 * needs. Its intentionally quiet placeholders communicate progress without
 * making users read or react while external image generation is still pending.
 */
export function ChatMerchDesignCarouselLoading() {
  return (
    <section
      aria-busy='true'
      aria-label='Preparing merch concepts'
      className='max-w-2xl'
    >
      <div className='grid grid-cols-3 gap-2.5' aria-hidden='true'>
        {[0, 1, 2].map(index => (
          <div
            key={index}
            className='aspect-square rounded-xl bg-surface-1 shadow-card'
          />
        ))}
      </div>
    </section>
  );
}

export function ChatMerchDesignCarousel({
  result,
  profileId,
}: {
  readonly result: MerchDesignCarouselResult;
  readonly profileId?: string;
}) {
  const designs = result.designs;
  const [active, setActive] = useState(0);
  const [selected, setSelected] =
    useState<ConfirmChatMerchSelectResponse | null>(null);
  const [productOptions, setProductOptions] = useState<
    ConfirmChatMerchProductsResponse['products']
  >([]);
  const [pendingCatalogProductId, setPendingCatalogProductId] = useState<
    number | null
  >(null);
  const [pendingAction, setPendingAction] = useState<
    'products' | 'select' | 'publish' | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmAction = useConfirmChatMerchActionMutation();
  const count = designs.length;
  const current = designs[Math.min(active, Math.max(0, count - 1))];

  useEffect(() => {
    prefetchMerchDesignPreviews(designs);
  }, [designs]);

  const go = useCallback(
    (dir: -1 | 1) => {
      setActive(prev => (prev + dir + count) % count);
    },
    [count]
  );

  if (count === 0 || !current) return null;

  const handleLoadProducts = () => {
    setErrorMessage(null);
    if (!profileId) {
      submitMerchPrompt(usePrompt(current));
      return;
    }

    setPendingAction('products');
    confirmAction.mutate(
      {
        profileId,
        generationId: result.generationId,
        optionId: current.id,
        optionNumber: current.option_number,
        action: 'products',
      },
      {
        onSuccess: response => {
          setPendingAction(null);
          if (isProductsResponse(response) && response.products.length > 0) {
            setProductOptions(response.products);
            return;
          }
          setErrorMessage('No products are available right now.');
        },
        onError: () => {
          setPendingAction(null);
          setErrorMessage('Unable to load products. Try again.');
        },
      }
    );
  };

  const handleSelectProduct = (catalogProductId: number) => {
    if (!profileId) return;
    setErrorMessage(null);
    setPendingAction('select');
    setPendingCatalogProductId(catalogProductId);
    confirmAction.mutate(
      {
        profileId,
        generationId: result.generationId,
        optionId: current.id,
        optionNumber: current.option_number,
        catalogProductId,
        action: 'select',
      },
      {
        onSuccess: response => {
          setPendingAction(null);
          setPendingCatalogProductId(null);
          if (isSelectionResponse(response)) {
            setSelected(response);
            setProductOptions([]);
            return;
          }
          setErrorMessage('Product details are not ready yet.');
        },
        onError: () => {
          setPendingAction(null);
          setPendingCatalogProductId(null);
          setErrorMessage('Unable to create this product. Try again.');
        },
      }
    );
  };

  const handlePublish = () => {
    if (!profileId || !selected) return;

    setErrorMessage(null);
    setPendingAction('publish');
    confirmAction.mutate(
      {
        profileId,
        merchCardId: selected.merchCardId,
        action: 'publish',
      },
      {
        onSuccess: response => {
          setPendingAction(null);
          if (!('status' in response)) {
            setErrorMessage('Unable to publish this item. Try again.');
            return;
          }
          setSelected(previous =>
            previous
              ? {
                  ...previous,
                  status: response.status,
                }
              : previous
          );
        },
        onError: () => {
          setPendingAction(null);
          setErrorMessage('Unable to publish this item. Try again.');
        },
      }
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (selected || productOptions.length > 0 || count < 2) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    }
  };

  const product = selected?.product;
  const showProductMockup =
    product?.mockupStatus === 'ready' && Boolean(product.mockupUrl);

  return (
    <section
      aria-label='Merch design concepts'
      aria-roledescription='carousel'
      className='max-w-2xl'
    >
      <div className='relative overflow-hidden rounded-xl'>
        {showProductMockup && product?.mockupUrl ? (
          <div className='relative aspect-square bg-surface-2'>
            <Image
              src={product.mockupUrl}
              alt={`${current.design_name} product mockup`}
              fill
              sizes='(max-width: 768px) 100vw, 640px'
              className='object-cover'
              unoptimized
            />
          </div>
        ) : current.status === 'ready' && current.preview_url ? (
          <ThreadImageCard
            status='ready'
            prompt={current.design_name}
            previewUrl={current.preview_url}
          />
        ) : (
          <ThreadImageCard status='generating' prompt={current.design_name} />
        )}

        {!selected && productOptions.length === 0 && count > 1 ? (
          <>
            <CarouselArrow side='left' onClick={() => go(-1)} />
            <CarouselArrow side='right' onClick={() => go(1)} />
          </>
        ) : null}
      </div>

      <div className='flex min-h-20 items-start justify-between gap-4 pt-3'>
        <div className='min-w-0 flex-1'>
          <p className='text-3xs font-medium uppercase tracking-wide text-tertiary-token'>
            {selected
              ? product?.mockupStatus === 'ready'
                ? 'Product mockup'
                : 'Artwork preview'
              : `Concept ${active + 1} of ${count}`}
          </p>
          <h3 className='mt-0.5 truncate text-app font-semibold text-primary-token'>
            {selected?.title ?? current.design_name}
          </h3>
          {selected && product ? (
            <>
              <p className='mt-0.5 truncate text-xs text-secondary-token'>
                {product.productName} · {product.colorway}
              </p>
              <p className='mt-1 text-2xs text-tertiary-token'>
                {product.retailPrice} · {product.artistProfit} artist profit
              </p>
              {product.mockupStatus === 'pending' ? (
                <p className='mt-1 text-2xs text-tertiary-token'>
                  Product mockup is still rendering. Artwork shown.
                </p>
              ) : null}
              {selected.publishBlockedReasons?.length ? (
                <p className='mt-1 line-clamp-2 text-2xs text-tertiary-token'>
                  {selected.publishBlockedReasons.join(' ')}
                </p>
              ) : null}
            </>
          ) : current.concept ? (
            <p className='mt-0.5 line-clamp-2 text-xs text-secondary-token'>
              {current.concept}
            </p>
          ) : null}
          {errorMessage ? (
            <output className='mt-1 block text-2xs text-error'>
              {errorMessage}
            </output>
          ) : null}
        </div>

        {selected && product ? (
          <Button
            type='button'
            size='sm'
            className='shrink-0 whitespace-nowrap'
            onClick={handlePublish}
            disabled={
              selected.status === 'live' ||
              !product.publishEligible ||
              pendingAction !== null
            }
          >
            {pendingAction === 'publish' ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin' aria-hidden />
            ) : selected.status === 'live' ? (
              <Check className='h-3.5 w-3.5' aria-hidden />
            ) : null}
            {selected.status === 'live'
              ? 'Live on profile'
              : 'Publish to profile'}
          </Button>
        ) : productOptions.length === 0 ? (
          <Button
            type='button'
            size='sm'
            className='shrink-0 whitespace-nowrap'
            onClick={handleLoadProducts}
            disabled={current.status !== 'ready' || pendingAction !== null}
          >
            {pendingAction === 'products' ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin' aria-hidden />
            ) : null}
            {pendingAction === 'products'
              ? 'Loading products'
              : 'Use this design'}
          </Button>
        ) : null}
      </div>

      {!selected && productOptions.length > 0 ? (
        <fieldset className='m-0 border-0 p-0 pb-2'>
          <legend className='mb-2 text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
            Choose a product
          </legend>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
            {productOptions.map(option => (
              <Button
                key={option.catalogProductId}
                type='button'
                variant='secondary'
                className='h-auto min-w-0 justify-start px-3 py-2 text-left'
                onClick={() => handleSelectProduct(option.catalogProductId)}
                disabled={pendingAction !== null}
              >
                {pendingCatalogProductId === option.catalogProductId ? (
                  <Loader2
                    className='h-3.5 w-3.5 shrink-0 animate-spin'
                    aria-hidden
                  />
                ) : null}
                <span className='min-w-0'>
                  <span className='block truncate text-xs font-medium'>
                    {option.productName}
                  </span>
                  <span className='block truncate text-2xs text-secondary-token'>
                    {option.colorway}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {!selected && productOptions.length === 0 && count > 1 ? (
        <nav className='flex items-center justify-center' aria-label='Concepts'>
          {designs.map((design, index) => (
            <Button
              key={design.id}
              type='button'
              variant='ghost'
              aria-label={`Go to concept ${index + 1}`}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
              onKeyDown={handleKeyDown}
              className='h-8 w-8 min-w-0 p-0 before:content-none'
            >
              <span
                className={cn(
                  'h-1.5 rounded-full transition-[width,background-color] duration-subtle',
                  index === active
                    ? 'w-5 bg-primary-token'
                    : 'w-1.5 bg-surface-2'
                )}
              />
            </Button>
          ))}
        </nav>
      ) : null}
    </section>
  );
}

function CarouselArrow({
  side,
  onClick,
}: {
  readonly side: 'left' | 'right';
  readonly onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Button
      type='button'
      variant='frosted'
      size='icon'
      aria-label={side === 'left' ? 'Previous concept' : 'Next concept'}
      onClick={onClick}
      className={cn(
        'absolute top-1/2 h-8 w-8 -translate-y-1/2',
        side === 'left' ? 'left-2' : 'right-2'
      )}
    >
      <Icon className='h-4 w-4' strokeWidth={2.25} />
    </Button>
  );
}
