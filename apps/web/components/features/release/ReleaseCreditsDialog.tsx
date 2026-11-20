'use client';

// @coverage-via apps/web/tests/unit/features/release/ReleaseCreditsDialog.test.tsx
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@jovie/ui';
import Link from 'next/link';
import { useState } from 'react';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
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
    <Button
      type='button'
      variant='frosted-ghost'
      size='sm'
      aria-label='View Credits'
      onClick={() => setOpen(true)}
    >
      <Icon name='Users' className='h-3.5 w-3.5' aria-hidden='true' />
      <span>View Credits</span>
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          {/*
            Bottom SheetContent already owns `p-5` (sheetSurfaceStyles) and
            `rounded-t-2xl` (bottom side variant). Do not nest a second px-5 or
            restyle radius/padding here — that double-pads and trips the
            shrink-only no-restyle gate.
          */}
          <SheetContent side='bottom' className='overflow-hidden'>
            <SheetHeader>
              <div className='border-b border-subtle pb-3 text-left'>
                <SheetTitle>Credits</SheetTitle>
                <SheetDescription className='sr-only'>
                  View all credited collaborators for this release
                </SheetDescription>
              </div>
            </SheetHeader>
            <div className='mt-4 rounded-xl bg-white/5 p-4 ring-1 ring-inset ring-white/[0.06]'>
              {content}
            </div>
            {/* Extra safe-area beyond the surface p-5 (1.25rem). */}
            <div
              aria-hidden
              className='h-[max(0px,calc(env(safe-area-inset-bottom)-1.25rem))]'
            />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Dialog open={open} onClose={() => setOpen(false)} size='sm'>
        <div className='mx-4 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] overflow-hidden sm:mx-auto sm:w-full'>
          <DialogTitle>Credits</DialogTitle>
          <DialogDescription className='sr-only'>
            View all credited collaborators for this release
          </DialogDescription>
          <DialogBody className='mt-2'>
            <div className='rounded-xl bg-white/5 p-4 ring-1 ring-inset ring-white/[0.06]'>
              {content}
            </div>
          </DialogBody>
        </div>
      </Dialog>
    </>
  );
}
