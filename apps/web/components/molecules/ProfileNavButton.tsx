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
import { APP_ROUTES } from '@/constants/routes';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { cn } from '@/lib/utils';

interface ProfileNavButtonProps {
  /** When true, shows back arrow; when false, shows Jovie icon */
  readonly showBackButton: boolean;
  /** The artist handle for back navigation */
  readonly artistHandle: string;
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
  className,
  loading = false,
}: ProfileNavButtonProps) {
  const [open, setOpen] = React.useState<boolean>(false);
  const { isSignedIn } = useAuthSafe();
  const isMdUp = useBreakpoint('md');

  const profileUrl = `${BASE_URL}/${artistHandle}`;

  // Main profile: Jovie icon linking to homepage
  if (!showBackButton) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <CircleIconButton
            size='md'
            variant='pearl'
            ariaLabel='Open profile menu'
            className={cn(
              'group backdrop-blur-xl',
              'transition-[opacity,transform,filter,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-95',
              className
            )}
          >
            <BrandLogo
              size={22}
              tone='auto'
              className={cn(
                'opacity-72 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
                loading && 'animate-pulse'
              )}
            />
          </CircleIconButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='start' sideOffset={8}>
          {isSignedIn && (
            <DropdownMenuItem asChild>
              <Link href={APP_ROUTES.DASHBOARD}>Dashboard</Link>
            </DropdownMenuItem>
          )}

          {isMdUp && (
            <DropdownMenuItem
              onSelect={() => {
                try {
                  globalThis.dispatchEvent(
                    new CustomEvent('jovie:open-profile-qr')
                  );
                } catch {}
              }}
            >
              View on mobile
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onSelect={() => {
              navigator.clipboard?.writeText(profileUrl).catch(() => {
                // clipboard access may fail in certain contexts
              });
            }}
          >
            Copy profile link
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href={APP_ROUTES.SIGNUP}>Claim your profile</Link>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Legal</DropdownMenuSubTrigger>
            <DropdownMenuSubContent sideOffset={8}>
              <DropdownMenuItem asChild>
                <Link
                  href={APP_ROUTES.LEGAL_PRIVACY}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  Privacy
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={APP_ROUTES.LEGAL_TERMS}
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
      size='md'
      variant='pearl'
      ariaLabel='Back to profile'
      className={cn('backdrop-blur-xl text-primary-token/76', className)}
    >
      <Link href={`/${artistHandle}`} data-testid='back-button'>
        <ArrowLeft
          className={cn(
            'h-[17px] w-[17px] text-primary-token/78',
            'transition-all duration-300 ease-out',
            'animate-in fade-in zoom-in-90 slide-in-from-right-1 duration-300'
          )}
          aria-hidden='true'
        />
      </Link>
    </CircleIconButton>
  );
}
