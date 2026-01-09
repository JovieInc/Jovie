'use client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@jovie/ui';
import Link from 'next/link';
import * as React from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { HeaderIconButton } from '@/components/atoms/HeaderIconButton';
import { PROFILE_URL } from '@/constants/domains';
import { cn } from '@/lib/utils';

interface ProfileNavButtonProps {
  /** When true, shows back arrow; when false, shows Jovie icon */
  showBackButton: boolean;
  /** The artist handle for back navigation */
  artistHandle: string;
  /** If true, creator has removed branding; hide upsell/claim CTA */
  hideBranding?: boolean;
  /** Additional class names */
  className?: string;
  /** Optional loading state to show animated spinner on the logo */
  loading?: boolean;
}

/**
 * Navigation button for profile pages.
 * - On main profile: Shows Jovie icon linking to homepage
 * - On sub-pages (listen, tip, etc.): Shows back button as Link
 */
export function ProfileNavButton({
  showBackButton,
  artistHandle,
  hideBranding = false,
  className,
  loading = false,
}: ProfileNavButtonProps) {
  const [open, setOpen] = React.useState<boolean>(false);

  const profileUrl = `${PROFILE_URL}/${artistHandle}`;

  const chromeSize = 'xs' as const;

  // Main profile: Jovie icon linking to homepage
  if (!showBackButton) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <HeaderIconButton
            size={chromeSize}
            ariaLabel='Open profile menu'
            className={cn(
              'group relative overflow-hidden',
              'bg-surface-0 backdrop-blur-md',
              'ring-1 ring-(--color-border-subtle)',
              'shadow-sm hover:shadow-md',
              'hover:bg-surface-1',
              'transition-[opacity,transform,filter,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90 active:scale-[0.97]',
              className
            )}
          >
            <div className='relative opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'>
              <BrandLogo size={24} tone='auto' className='h-6 w-6' priority />
              <BrandLogo
                size={24}
                tone='auto'
                alt=''
                aria-hidden
                className={cn(
                  'absolute inset-0 h-6 w-6',
                  'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  loading
                    ? 'opacity-100 scale-100 animate-spin-slow'
                    : 'opacity-0 scale-0 pointer-events-none'
                )}
                priority
              />
            </div>
          </HeaderIconButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='start' sideOffset={8}>
          <DropdownMenuItem
            onSelect={() => {
              try {
                const isMdUp = window.matchMedia('(min-width: 768px)').matches;
                if (isMdUp) {
                  window.dispatchEvent(
                    new CustomEvent('jovie:open-profile-qr')
                  );
                }
              } catch {}
            }}
          >
            View on mobile
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              try {
                void navigator.clipboard?.writeText(profileUrl);
              } catch {}
            }}
          >
            Copy profile link
          </DropdownMenuItem>

          {!hideBranding ? (
            <DropdownMenuItem asChild>
              <Link href='/waitlist'>Claim your profile</Link>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Legal</DropdownMenuSubTrigger>
            <DropdownMenuSubContent sideOffset={8}>
              <DropdownMenuItem asChild>
                <Link
                  href='/legal/privacy'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  Privacy
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href='/legal/terms'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  Terms
                </Link>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Sub-page: Back button - use Link for instant navigation (no spinner needed)
  return (
    <HeaderIconButton
      asChild
      size={chromeSize}
      ariaLabel='Back to profile'
      className={cn(
        'bg-surface-0 backdrop-blur-md',
        'border border-subtle',
        'shadow-sm hover:shadow-md',
        'hover:bg-surface-1',
        'transition-all duration-200',
        className
      )}
    >
      <Link href={`/${artistHandle}`} data-testid='back-button'>
        <svg
          className={cn(
            'h-4 w-4 text-secondary-token',
            'transition-all duration-300 ease-out',
            'animate-in fade-in zoom-in-90 slide-in-from-right-1 duration-300'
          )}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M10 19l-7-7m0 0l7-7m-7 7h18'
          />
        </svg>
      </Link>
    </HeaderIconButton>
  );
}
