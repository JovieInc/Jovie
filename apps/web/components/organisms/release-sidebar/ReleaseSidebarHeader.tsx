'use client';

/**
 * ReleaseSidebarHeader Component
 *
 * Header section of the release sidebar with action buttons
 */

import { Copy, ExternalLink, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';

import { CircleIconButton } from '@/components/atoms/CircleIconButton';

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
            <CircleIconButton
              size='xs'
              variant='ghost'
              ariaLabel='Copy smart link'
              onClick={onCopySmartLink}
              className='hover:scale-105'
            >
              <Copy aria-hidden />
            </CircleIconButton>
            <CircleIconButton
              size='xs'
              variant='ghost'
              ariaLabel='Refresh release'
              onClick={() => {
                if (onRefresh) {
                  onRefresh();
                  return;
                }
                window.location.reload();
              }}
              className='hover:scale-105'
            >
              <RefreshCw aria-hidden />
            </CircleIconButton>
            <CircleIconButton
              size='xs'
              variant='ghost'
              ariaLabel='Open smart link'
              asChild
              className='hover:scale-105'
            >
              <Link
                href={release!.smartLinkPath}
                target='_blank'
                rel='noopener noreferrer'
              >
                <ExternalLink aria-hidden />
              </Link>
            </CircleIconButton>
          </>
        )}
        {onClose && (
          <CircleIconButton
            size='xs'
            variant='ghost'
            ariaLabel='Close release sidebar'
            onClick={onClose}
            className='hover:scale-105'
          >
            <X aria-hidden='true' />
          </CircleIconButton>
        )}
      </div>
    </div>
  );
}
