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
    <div className='system-b-thread-media-card'>
      <div className='system-b-thread-media-preview system-b-thread-image-preview'>
        {status === 'generating' ? (
          <div className='system-b-thread-media-generating'>
            <div aria-hidden='true' className='system-b-thread-image-shimmer' />
            <p className='system-b-thread-generating-copy'>
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
      <div className='system-b-thread-media-footer'>
        <Sparkles className='system-b-thread-media-icon' strokeWidth={2.25} />
        <span className='system-b-thread-media-label'>{prompt}</span>
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
