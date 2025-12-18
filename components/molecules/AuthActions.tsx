'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AuthActions() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key.toLowerCase() !== 'l') return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        const isTextInput =
          tagName === 'input' || tagName === 'textarea' || tagName === 'select';

        if (isTextInput || target.isContentEditable) {
          return;
        }
      }

      event.preventDefault();
      router.push('/signin');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <TooltipProvider>
      <div className='flex items-center gap-2'>
        {/* Login - Geist secondary/ghost button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href='/signin'
              className='inline-flex items-center justify-center h-8 px-3 text-[13px] font-medium rounded-[8px] bg-transparent text-tertiary-token hover:text-primary-token hover:bg-black/4 dark:hover:bg-white/8 transition-colors duration-100 ease-out focus-ring-themed'
              aria-label='Log in (L)'
            >
              Log in
            </Link>
          </TooltipTrigger>
          <TooltipContent side='bottom'>
            <span>Log in</span>
            <kbd className='ml-1 inline-flex items-center rounded border border-subtle bg-surface-2 px-1 text-[10px] font-medium text-secondary-token'>
              L
            </kbd>
          </TooltipContent>
        </Tooltip>
        {/* Sign up - Geist primary button */}
        <Link
          href='/waitlist'
          className='inline-flex items-center justify-center h-8 px-3 text-[13px] font-medium rounded-md bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 transition-colors duration-150 focus-ring-themed'
        >
          Request early access
        </Link>
      </div>
    </TooltipProvider>
  );
}
