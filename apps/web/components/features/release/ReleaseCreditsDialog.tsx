'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@jovie/ui';
import Link from 'next/link';
import { useState } from 'react';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { FrostedButton } from '@/components/atoms/FrostedButton';
import { Icon } from '@/components/atoms/Icon';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface ReleaseCreditsDialogProps {
  readonly credits?: SmartLinkCreditGroup[];
}

export function ReleaseCreditsDialog({
  credits,
}: Readonly<ReleaseCreditsDialogProps>) {
  const [open, setOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 639px)');
  const visibleCredits =
    credits?.filter(group => group.entries.length > 0) ?? [];
  const content = (
    <div
      className='max-h-[min(28rem,62vh)] space-y-6 overflow-y-auto pr-1'
      data-testid='credits-scroll-container'
    >
      {visibleCredits.map(group => (
        <section key={group.role} aria-labelledby={`credits-${group.role}`}>
          <h3
            id={`credits-${group.role}`}
            className='text-muted-foreground/85 text-2xs font-semibold uppercase tracking-[0.14em]'
          >
            {group.label}
          </h3>
          <ul className='mt-2 space-y-1.5'>
            {group.entries.map(entry => (
              <li key={`${entry.role}-${entry.artistId}-${entry.name}`}>
                {entry.handle ? (
                  <Link
                    href={`/${entry.handle}`}
                    className='text-sm font-medium text-foreground transition-colors hover:text-foreground/80'
                  >
                    {entry.name}
                  </Link>
                ) : (
                  <span className='text-sm font-medium text-foreground'>
                    {entry.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );

  if (visibleCredits.length === 0) {
    return null;
  }

  const trigger = (
    <FrostedButton
      type='button'
      tone='ghost'
      size='sm'
      aria-label='View credits'
      onClick={() => setOpen(true)}
      className='inline-flex w-auto items-center justify-center gap-1.5 px-3.5 text-foreground/80 hover:text-foreground'
    >
      <Icon name='Users' className='h-3.5 w-3.5' aria-hidden='true' />
      <span>View credits</span>
    </FrostedButton>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side='bottom'
            className='overflow-hidden rounded-t-2xl px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]'
          >
            <SheetHeader className='border-b border-subtle pb-3 text-left'>
              <SheetTitle className='text-[13px] font-semibold text-primary-token'>
                Credits
              </SheetTitle>
              <SheetDescription className='sr-only'>
                View all credited collaborators for this release
              </SheetDescription>
            </SheetHeader>
            <div className='mt-4 rounded-xl bg-surface-1/30 p-4 ring-1 ring-inset ring-white/[0.06]'>
              {content}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size='sm'
        className='mx-4 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] overflow-hidden sm:mx-auto sm:w-full'
      >
        <DialogTitle className='text-[13px] font-semibold text-primary-token'>
          Credits
        </DialogTitle>
        <DialogDescription className='sr-only'>
          View all credited collaborators for this release
        </DialogDescription>
        <DialogBody className='mt-2'>
          <div className='rounded-xl bg-surface-1/30 p-4 ring-1 ring-inset ring-white/[0.06]'>
            {content}
          </div>
        </DialogBody>
      </Dialog>
    </>
  );
}
