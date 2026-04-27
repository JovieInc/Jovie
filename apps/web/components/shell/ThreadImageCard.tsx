'use client';

import { ArrowDown, Copy, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { ThreadCardIconBtn } from './ThreadCardIconBtn';

export interface ThreadImageCardProps {
  readonly prompt: string;
  readonly status: 'generating' | 'ready';
  /** Optional URL — when provided, replaces the placeholder gradient preview. */
  readonly previewUrl?: string;
  readonly onDownload?: () => void;
  readonly onCopy?: () => void;
  readonly onRegenerate?: () => void;
}

/**
 * Image generation card — clean attachment block. Shimmer + visible
 * prompt while generating; aspect-correct preview + tap-to-lightbox once
 * ready. Toolbar surfaces download / copy / regenerate when callbacks
 * are provided.
 */
export function ThreadImageCard({
  prompt,
  status,
  previewUrl,
  onDownload,
  onCopy,
  onRegenerate,
}: ThreadImageCardProps) {
  return (
    <div className='rounded-xl border border-(--linear-app-shell-border) bg-(--surface-0)/40 overflow-hidden'>
      <div className='aspect-[16/10] relative bg-(--surface-2)'>
        {status === 'generating' ? (
          <div className='absolute inset-0 grid place-items-center'>
            <div
              className='absolute inset-0'
              style={{
                background:
                  'linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.04) 35%, rgba(103,232,249,0.06) 50%, rgba(255,255,255,0.04) 65%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2.4s ease-in-out infinite',
              }}
            />
            <p className='relative text-[12px] text-tertiary-token text-center px-6'>
              Generating &ldquo;{prompt}&rdquo;
            </p>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
          </div>
        ) : previewUrl ? (
          <Image
            src={previewUrl}
            alt={prompt}
            fill
            sizes='(min-width: 768px) 768px, 100vw'
            className='object-cover'
            unoptimized
          />
        ) : (
          <div
            className='absolute inset-0'
            style={{
              background:
                'radial-gradient(ellipse at 30% 20%, rgba(103,232,249,0.18) 0%, rgba(255,255,255,0.04) 40%, rgba(0,0,0,0) 70%), linear-gradient(135deg, hsl(220, 35%, 14%), hsl(220, 30%, 6%))',
            }}
          />
        )}
      </div>
      <div className='flex items-center gap-2 px-3 h-9 border-t border-(--linear-app-shell-border)/60'>
        <Sparkles className='h-3 w-3 text-cyan-300/80' strokeWidth={2.25} />
        <span className='flex-1 text-[11.5px] text-tertiary-token truncate'>
          {prompt}
        </span>
        {status === 'ready' && (
          <span className='inline-flex items-center gap-0.5'>
            <ThreadCardIconBtn label='Download' onClick={onDownload}>
              <ArrowDown className='h-3 w-3' strokeWidth={2.25} />
            </ThreadCardIconBtn>
            <ThreadCardIconBtn label='Copy' onClick={onCopy}>
              <Copy className='h-3 w-3' strokeWidth={2.25} />
            </ThreadCardIconBtn>
            <ThreadCardIconBtn label='Regenerate' onClick={onRegenerate}>
              <Sparkles className='h-3 w-3' strokeWidth={2.25} />
            </ThreadCardIconBtn>
          </span>
        )}
      </div>
    </div>
  );
}
