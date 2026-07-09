'use client';

import { Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ThreadImageCard } from '@/components/shell/ThreadImageCard';
import type {
  MerchDesignCarouselResult,
  MerchDesignPreview,
} from '@/lib/merch/types';
import { cn } from '@/lib/utils';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';

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

function usePrompt(generationId: string, design: MerchDesignPreview): string {
  return `Use design ${design.option_number} from generation ${generationId}.`;
}

export function ChatMerchDesignCarousel({
  result,
}: {
  readonly result: MerchDesignCarouselResult;
}) {
  const designs = result.designs;
  const [active, setActive] = useState(0);
  const count = designs.length;
  const current = designs[Math.min(active, Math.max(0, count - 1))];

  const go = useCallback(
    (dir: -1 | 1) => {
      setActive(prev => (prev + dir + count) % count);
    },
    [count]
  );

  if (count === 0 || !current) return null;

  const useThis = () =>
    submitMerchPrompt(usePrompt(result.generationId, current));

  return (
    <ChatGenerationArtifactSurface
      title='Merch Designs'
      subtitle={result.nextStep ?? 'Pick one and I’ll put it on products'}
      className='max-w-2xl'
    >
      <div className='flex flex-col gap-3'>
        <div className='relative'>
          {/* Fixed-aspect media so generating -> ready never shifts layout. */}
          <div className='overflow-hidden rounded-xl'>
            {current.status === 'ready' && current.preview_url ? (
              <ThreadImageCard
                status='ready'
                prompt={current.design_name}
                previewUrl={current.preview_url}
              />
            ) : (
              <ThreadImageCard
                status='generating'
                prompt={current.design_name}
              />
            )}
          </div>

          {count > 1 ? (
            <>
              <CarouselArrow side='left' onClick={() => go(-1)} />
              <CarouselArrow side='right' onClick={() => go(1)} />
            </>
          ) : null}
        </div>

        <div className='flex min-h-9 items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h3 className='truncate text-app font-semibold text-primary-token'>
              {current.design_name}
            </h3>
            {current.concept ? (
              <p className='mt-0.5 line-clamp-1 text-2xs text-tertiary-token'>
                {current.concept}
              </p>
            ) : null}
          </div>
          <Button
            type='button'
            size='sm'
            onClick={useThis}
            disabled={current.status !== 'ready'}
          >
            Use This One
          </Button>
        </div>

        {count > 1 ? (
          <div className='flex items-center justify-center gap-1.5'>
            {designs.map((design, index) => (
              <Button
                key={design.id}
                type='button'
                variant='ghost'
                aria-label={`Go to design ${index + 1}`}
                aria-current={index === active}
                onClick={() => setActive(index)}
                className={cn(
                  'h-1.5 min-w-0 p-0 before:content-none',
                  'rounded-full transition-[width,background-color] duration-subtle',
                  index === active
                    ? 'w-5 bg-primary-token hover:bg-primary-token'
                    : 'w-1.5 bg-surface-2 hover:bg-surface-2'
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </ChatGenerationArtifactSurface>
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
      aria-label={side === 'left' ? 'Previous design' : 'Next design'}
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
