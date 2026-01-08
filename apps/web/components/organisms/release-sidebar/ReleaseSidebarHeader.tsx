'use client';

/**
 * ReleaseSidebarHeader Component
 *
 * Header section of the release sidebar with action buttons
 */

import { Copy, ExternalLink, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';

import { HeaderIconButton } from '@/components/atoms/HeaderIconButton';

import type { Release } from './types';

interface ReleaseSidebarHeaderProps {
  release: Release | null;
  hasRelease: boolean;
  onClose?: () => void;
  onRefresh?: () => void;
  onCopySmartLink: () => void;
}

export function ReleaseSidebarHeader({
  release,
  hasRelease,
  onClose,
  onRefresh,
  onCopySmartLink,
}: ReleaseSidebarHeaderProps) {
  const showActions = hasRelease && release?.smartLinkPath;

  return (
    <div className='flex items-center justify-between border-b border-sidebar-border px-3 py-2'>
      <p className='text-xs text-sidebar-muted'>
        {hasRelease ? `ID: ${release?.id}` : 'No release selected'}
      </p>
      <div className='flex items-center gap-1'>
        {showActions && (
          <>
            <HeaderIconButton
              size='xs'
              ariaLabel='Copy smart link'
              onClick={onCopySmartLink}
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <Copy className='h-4 w-4' aria-hidden />
            </HeaderIconButton>
            <HeaderIconButton
              size='xs'
              ariaLabel='Refresh release'
              onClick={() => {
                if (onRefresh) {
                  onRefresh();
                  return;
                }
                window.location.reload();
              }}
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <RefreshCw className='h-4 w-4' aria-hidden />
            </HeaderIconButton>
            <HeaderIconButton
              size='xs'
              ariaLabel='Open smart link'
              asChild
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <Link
                href={release!.smartLinkPath}
                target='_blank'
                rel='noopener noreferrer'
              >
                <ExternalLink className='h-4 w-4' aria-hidden />
              </Link>
            </HeaderIconButton>
          </>
        )}
        {onClose && (
          <HeaderIconButton
            size='xs'
            ariaLabel='Close release sidebar'
            onClick={onClose}
            className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
          >
            <X className='h-4 w-4' aria-hidden='true' />
          </HeaderIconButton>
        )}
      </div>
    </div>
  );
}
