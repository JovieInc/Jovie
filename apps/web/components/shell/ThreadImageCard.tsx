'use client';

import { ArrowDown, Copy, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { ThreadCardIconBtn } from './ThreadCardIconBtn';

/**
 * Discriminated union — when `status === 'ready'` a `previewUrl` is
 * required; the generating state never carries one. This guarantees a
 * `ready` card never renders the empty placeholder gradient as a stand-in
 * for an actually-rendered preview.
 */
export type ThreadImageCardProps =
  | {
      readonly status: 'generating';
      readonly prompt: string;
      readonly previewUrl?: never;
      readonly onDownload?: never;
      readonly onCopy?: never;
      readonly onRegenerate?: never;
    }
  | {
      readonly status: 'ready';
      readonly prompt: string;
      readonly previewUrl: string;
      readonly onDownload?: () => void;
      readonly onCopy?: () => void;
      readonly onRegenerate?: () => void;
    };

const SHIMMER_BG =
  'linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.04) 35%, rgba(103,232,249,0.06) 50%, rgba(255,255,255,0.04) 65%, transparent 100%)';

/**
 * Image generation card — clean attachment block. Shimmer + visible
 * prompt while generating; aspect-correct preview + tap-to-lightbox once
 * ready. Toolbar surfaces download / copy / regenerate only when the
 * matching callback is provided so the UI never advertises a no-op.
 *
 * The shimmer animation references the global `shimmer` keyframe defined
 * in `app/globals.css` so multiple generating cards share a single
 * keyframe definition rather than each injecting their own `<style>`.
 */
export function ThreadImageCard(props: ThreadImageCardProps) {
  const { prompt, status } = props;
  return (
    <div className='rounded-xl border border-(--linear-app-shell-border) bg-(--surface-0)/40 overflow-hidden'>
      <div className='aspect-[16/10] relative bg-(--surface-2)'>
        {status === 'generating' ? (
          <div className='absolute inset-0 grid place-items-center'>
            <div
              aria-hidden='true'
              className='absolute inset-0'
              style={{
                backgroundImage: SHIMMER_BG,
                backgroundSize: '200% 100%',
                animation: 'shimmer 2.4s ease-in-out infinite',
              }}
            />
            <p className='relative text-[12px] text-tertiary-token text-center px-6'>
              Generating &ldquo;{prompt}&rdquo;
            </p>
          </div>
        ) : (
          <Image
            src={props.previewUrl}
            alt={prompt}
            fill
            sizes='(min-width: 768px) 768px, 100vw'
            className='object-cover'
            unoptimized
          />
        )}
      </div>
      <div className='flex items-center gap-2 px-3 h-9 border-t border-(--linear-app-shell-border)/60'>
        <Sparkles className='h-3 w-3 text-cyan-300/80' strokeWidth={2.25} />
        <span className='flex-1 text-[11.5px] text-tertiary-token truncate'>
          {prompt}
        </span>
        {status === 'ready' &&
          (props.onDownload || props.onCopy || props.onRegenerate) && (
            <span className='inline-flex items-center gap-0.5'>
              {props.onDownload && (
                <ThreadCardIconBtn label='Download' onClick={props.onDownload}>
                  <ArrowDown className='h-3 w-3' strokeWidth={2.25} />
                </ThreadCardIconBtn>
              )}
              {props.onCopy && (
                <ThreadCardIconBtn label='Copy' onClick={props.onCopy}>
                  <Copy className='h-3 w-3' strokeWidth={2.25} />
                </ThreadCardIconBtn>
              )}
              {props.onRegenerate && (
                <ThreadCardIconBtn
                  label='Regenerate'
                  onClick={props.onRegenerate}
                >
                  <Sparkles className='h-3 w-3' strokeWidth={2.25} />
                </ThreadCardIconBtn>
              )}
            </span>
          )}
      </div>
    </div>
  );
}
