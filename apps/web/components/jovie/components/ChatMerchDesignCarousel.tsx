'use client';

import { Button } from '@jovie/ui';
import { Check, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  MerchDesignCarouselResult,
  MerchDesignPreview,
} from '@/lib/merch/types';
import {
  type ConfirmChatMerchProductsResponse,
  type ConfirmChatMerchSelectResponse,
  useConfirmChatMerchActionMutation,
} from '@/lib/queries';

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
  return Array.isArray(products);
}

function DesignArt({ design }: { readonly design: MerchDesignPreview }) {
  if (design.status === 'ready' && design.preview_url) {
    return (
      <Image
        src={design.preview_url}
        alt={`${design.design_name} design`}
        fill
        sizes='(max-width: 639px) 16rem, (max-width: 1023px) 12rem, 13rem'
        className='object-cover'
      />
    );
  }

  return (
    <div
      className='flex h-full items-center justify-center bg-surface-0 text-2xs text-tertiary-token'
      role='status'
    >
      <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' aria-hidden />
      Rendering
    </div>
  );
}

/**
 * Warm every ready image when the tool result arrives so choosing among the
 * three concepts never adds a second image-loading wait.
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

/** Reserves the exact three-slot chooser footprint while generation runs. */
export function ChatMerchDesignCarouselLoading() {
  return (
    <section
      aria-busy='true'
      aria-label='Preparing merch concepts'
      className='max-w-3xl'
    >
      <div className='grid grid-cols-3 gap-3' aria-hidden='true'>
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
  const [chosenDesign, setChosenDesign] = useState<MerchDesignPreview | null>(
    null
  );
  const [productOptions, setProductOptions] = useState<
    ConfirmChatMerchProductsResponse['products']
  >([]);
  const [selected, setSelected] =
    useState<ConfirmChatMerchSelectResponse | null>(null);
  const [pendingCatalogProductId, setPendingCatalogProductId] = useState<
    number | null
  >(null);
  const [pendingAction, setPendingAction] = useState<
    'products' | 'select' | 'publish' | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmAction = useConfirmChatMerchActionMutation();

  useEffect(() => {
    prefetchMerchDesignPreviews(result.designs);
  }, [result.designs]);

  const loadProducts = (design: MerchDesignPreview) => {
    setChosenDesign(design);
    setErrorMessage(null);
    if (!profileId) {
      submitMerchPrompt(`Use concept ${design.option_number}.`);
      return;
    }
    setPendingAction('products');
    confirmAction.mutate(
      {
        profileId,
        generationId: result.generationId,
        optionId: design.id,
        optionNumber: design.option_number,
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

  const selectProduct = (catalogProductId: number) => {
    if (!profileId || !chosenDesign) return;
    setErrorMessage(null);
    setPendingAction('select');
    setPendingCatalogProductId(catalogProductId);
    confirmAction.mutate(
      {
        profileId,
        generationId: result.generationId,
        optionId: chosenDesign.id,
        optionNumber: chosenDesign.option_number,
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

  const publish = () => {
    if (!profileId || !selected) return;
    setErrorMessage(null);
    setPendingAction('publish');
    confirmAction.mutate(
      { profileId, merchCardId: selected.merchCardId, action: 'publish' },
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
                  publicUrl:
                    'publicUrl' in response
                      ? response.publicUrl
                      : previous.publicUrl,
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

  if (result.designs.length === 0) return null;

  if (selected && chosenDesign) {
    const product = selected.product;
    const live = selected.status === 'live';
    const art =
      product.mockupStatus === 'ready' && product.mockupUrl
        ? product.mockupUrl
        : chosenDesign.preview_url;
    return (
      <section aria-label='Selected merch product' className='max-w-3xl'>
        <article className='grid gap-3 sm:grid-cols-3'>
          <div className='relative aspect-square overflow-hidden rounded-lg bg-surface-0'>
            {art ? (
              <Image
                src={art}
                alt={`${selected.title} ${product.productName}`}
                fill
                sizes='(max-width: 639px) 100vw, 13rem'
                className='object-cover'
              />
            ) : (
              <DesignArt design={chosenDesign} />
            )}
          </div>
          <div className='flex min-w-0 flex-col justify-between gap-3 py-1 sm:col-span-2'>
            <div>
              <h3 className='truncate text-app font-semibold text-primary-token'>
                {selected.title}
              </h3>
              <p className='mt-1 text-xs text-secondary-token'>
                {product.productName} · {product.colorway}
              </p>
              <p className='mt-1 text-2xs text-tertiary-token'>
                {product.retailPrice} · {product.artistProfit} artist profit
              </p>
              {product.mockupStatus === 'pending' ? (
                <p className='mt-1 text-2xs text-tertiary-token'>
                  Artwork is shown while the product mockup renders.
                </p>
              ) : null}
              {selected.publishBlockedReasons?.length ? (
                <p className='mt-1 line-clamp-2 text-2xs text-tertiary-token'>
                  {selected.publishBlockedReasons.join(' ')}
                </p>
              ) : null}
            </div>
            {live && selected.publicUrl ? (
              <Button asChild size='sm' className='w-fit'>
                <Link href={selected.publicUrl}>Open merch page</Link>
              </Button>
            ) : (
              <Button
                type='button'
                size='sm'
                className='w-fit'
                onClick={publish}
                disabled={
                  !product.publishEligible || pendingAction !== null || live
                }
              >
                {pendingAction === 'publish' ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' aria-hidden />
                ) : live ? (
                  <Check className='h-3.5 w-3.5' aria-hidden />
                ) : null}
                {live ? 'Live on profile' : 'Publish to profile'}
              </Button>
            )}
          </div>
        </article>
      </section>
    );
  }

  if (chosenDesign && productOptions.length > 0) {
    return (
      <section aria-label='Choose a merch product' className='max-w-3xl'>
        <article className='grid gap-3 sm:grid-cols-3'>
          <div className='relative aspect-square overflow-hidden rounded-lg bg-surface-0'>
            <DesignArt design={chosenDesign} />
          </div>
          <div className='min-w-0 py-1 sm:col-span-2'>
            <h3 className='truncate text-app font-semibold text-primary-token'>
              {chosenDesign.design_name}
            </h3>
            <p className='mt-1 text-xs text-secondary-token'>
              Choose the product.
            </p>
            <ul className='mt-3 flex flex-wrap gap-2'>
              {productOptions.map(option => (
                <li key={option.catalogProductId}>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    onClick={() => selectProduct(option.catalogProductId)}
                    disabled={pendingAction !== null}
                  >
                    {pendingCatalogProductId === option.catalogProductId ? (
                      <Loader2
                        className='h-3.5 w-3.5 animate-spin'
                        aria-hidden
                      />
                    ) : null}
                    {option.productName}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section aria-label='Merch design concepts' className='max-w-3xl'>
      <p className='mb-3 text-xs text-secondary-token'>
        Do you like any of these?
      </p>
      <div className='flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible'>
        {result.designs.slice(0, 3).map(design => (
          <article
            key={design.id}
            data-testid='chat-merch-option-card'
            className='group relative min-w-64 snap-start overflow-hidden rounded-xl bg-surface-0 sm:min-w-0'
          >
            <div className='relative aspect-square'>
              <DesignArt design={design} />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent' />
              <Button
                type='button'
                size='sm'
                className='absolute bottom-2 right-2 z-10 whitespace-nowrap'
                onClick={() => loadProducts(design)}
                disabled={design.status !== 'ready' || pendingAction !== null}
              >
                {pendingAction === 'products' &&
                chosenDesign?.id === design.id ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' aria-hidden />
                ) : null}
                Select
              </Button>
            </div>
            <div className='min-w-0 px-2.5 py-2'>
              <h3 className='truncate text-xs font-medium text-primary-token'>
                {design.design_name}
              </h3>
            </div>
          </article>
        ))}
      </div>
      {errorMessage ? (
        <output className='mt-2 block text-2xs text-error'>
          {errorMessage}
        </output>
      ) : null}
    </section>
  );
}
