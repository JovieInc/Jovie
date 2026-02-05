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
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { BASE_URL } from '@/constants/domains';
import { cn } from '@/lib/utils';

interface ProfileNavButtonProps {
  /** When true, shows back arrow; when false, shows Jovie icon */
  readonly showBackButton: boolean;
  /** The artist handle for back navigation */
  readonly artistHandle: string;
  /** If true, creator has removed branding; hide upsell/claim CTA */
  readonly hideBranding?: boolean;
  /** Additional class names */
  readonly className?: string;
  /** Optional loading state to show animated spinner on the logo */
  readonly loading?: boolean;
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

  const profileUrl = `${BASE_URL}/${artistHandle}`;

  // Main profile: Jovie icon linking to homepage
  if (!showBackButton) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <CircleIconButton
            size='xs'
            variant='surface'
            ariaLabel='Open profile menu'
            className={cn(
              'group relative overflow-hidden backdrop-blur-md',
              'transition-[opacity,transform,filter,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90',
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
          </CircleIconButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='start' sideOffset={8}>
          <DropdownMenuItem
            onSelect={() => {
              try {
                const isMdUp =
                  globalThis.matchMedia('(min-width: 768px)').matches;
                if (isMdUp) {
                  globalThis.dispatchEvent(
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
              navigator.clipboard?.writeText(profileUrl).catch(() => {
                // clipboard access may fail in certain contexts
              });
            }}
          >
            Copy profile link
          </DropdownMenuItem>

          {hideBranding ? null : (
            <DropdownMenuItem asChild>
              <Link href='/waitlist'>Claim your profile</Link>
            </DropdownMenuItem>
          )}

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
    <CircleIconButton
      asChild
      size='xs'
      variant='surface'
      ariaLabel='Back to profile'
      className={cn('backdrop-blur-md', className)}
    >
      <Link href={`/${artistHandle}`} data-testid='back-button'>
        <ArrowLeft
          className={cn(
            'h-4 w-4 text-secondary-token',
            'transition-all duration-300 ease-out',
            'animate-in fade-in zoom-in-90 slide-in-from-right-1 duration-300'
          )}
          aria-hidden='true'
        />
      </Link>
    </CircleIconButton>
  );
}
