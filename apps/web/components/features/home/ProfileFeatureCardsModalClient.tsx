'use client';

import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';

type FeatureId = 'fast' | 'design' | 'setup';

interface FeatureItem {
  id: FeatureId;
  title: string;
  imageSrc: string;
  imageAlt: string;
  headline: string;
  body: string;
}

export interface ProfileFeatureCardsModalClientProps {
  readonly features: readonly FeatureItem[];
}

export function ProfileFeatureCardsModalClient({
  features,
}: ProfileFeatureCardsModalClientProps) {
  const [activeId, setActiveId] = useState<FeatureId | null>(null);

  const active = useMemo<FeatureItem | null>(() => {
    if (!activeId) return null;
    return features.find(feature => feature.id === activeId) ?? null;
  }, [activeId, features]);

  const handleFeatureClick = useCallback((id: FeatureId) => {
    setActiveId(id);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <>
      <div className='grid gap-4 sm:gap-6 md:grid-cols-3'>
        {features.map(feature => (
          <button
            key={feature.id}
            type='button'
            aria-haspopup='dialog'
            aria-expanded={activeId === feature.id}
            onClick={() => handleFeatureClick(feature.id)}
            className='group rounded-3xl border border-subtle bg-surface-1 overflow-hidden text-left focus-ring-themed'
          >
            <div className='relative flex min-h-[240px] flex-col justify-end gap-4 p-6 sm:p-7 cursor-pointer select-none'>
              <div className='absolute inset-0 opacity-70'>
                <Image
                  src={feature.imageSrc}
                  alt={feature.imageAlt}
                  fill={true}
                  sizes='(max-width: 768px) 100vw, 33vw'
                  className='object-cover'
                />
                {feature.id === 'fast' && (
                  <>
                    <div className='absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.18),transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.22),transparent_55%)]' />
                    <div className='absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.06),transparent_40%)] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_40%)]' />
                  </>
                )}
                {feature.id === 'design' && (
                  <>
                    <div className='absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(120,119,198,0.16),transparent_60%)] dark:bg-[radial-gradient(circle_at_70%_25%,rgba(120,119,198,0.22),transparent_60%)]' />
                    <div className='absolute inset-0 bg-[linear-gradient(135deg,transparent_10%,rgba(0,0,0,0.06))] dark:bg-[linear-gradient(135deg,transparent_10%,rgba(255,255,255,0.06))]' />
                  </>
                )}
                {feature.id === 'setup' && (
                  <>
                    <div className='absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(120,119,198,0.14),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_20%,rgba(120,119,198,0.20),transparent_60%)]' />
                    <div className='absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.06),transparent_45%)] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_45%)]' />
                  </>
                )}
              </div>

              <div className='relative flex items-end justify-between gap-6'>
                <h3 className='text-lg font-semibold leading-tight text-primary-token'>
                  {feature.title}
                </h3>
                <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-transform group-hover:rotate-45'>
                  +
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={activeId !== null} onClose={handleCloseDialog} size='3xl'>
        {active ? (
          <div className='space-y-5'>
            <div className='relative aspect-video overflow-hidden rounded-2xl border border-subtle bg-surface-1'>
              <Image
                src={active.imageSrc}
                alt={active.imageAlt}
                fill={true}
                sizes='(max-width: 1024px) 100vw, 1024px'
                className='object-cover'
              />
            </div>

            <div>
              <DialogTitle className='text-xl font-semibold text-primary-token'>
                {active.title}
              </DialogTitle>
              <DialogDescription className='mt-2 text-sm sm:text-base text-secondary-token'>
                {active.headline}
              </DialogDescription>
              <DialogBody className='mt-4'>
                <p className='text-sm sm:text-base leading-relaxed text-secondary-token'>
                  {active.body}
                </p>
              </DialogBody>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
