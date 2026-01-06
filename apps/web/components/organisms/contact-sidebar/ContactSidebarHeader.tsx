'use client';

/**
 * ContactSidebarHeader Component
 *
 * Header section of the contact sidebar with action buttons
 */

import { Copy, ExternalLink, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';

import { HeaderIconButton } from '@/components/atoms/HeaderIconButton';

import type { Contact } from './types';

interface ContactSidebarHeaderProps {
  contact: Contact | null;
  hasContact: boolean;
  onClose?: () => void;
  onRefresh?: () => void;
  onCopyProfileUrl: () => void;
}

export function ContactSidebarHeader({
  contact,
  hasContact,
  onClose,
  onRefresh,
  onCopyProfileUrl,
}: ContactSidebarHeaderProps) {
  const showActions = hasContact && contact?.username;

  return (
    <div className='flex items-center justify-between border-b border-sidebar-border px-3 py-2'>
      <p className='text-xs text-sidebar-muted'>
        {hasContact ? `ID: ${contact?.id}` : 'No contact selected'}
      </p>
      <div className='flex items-center gap-1'>
        {showActions && (
          <>
            <HeaderIconButton
              size='xs'
              ariaLabel='Copy profile link'
              onClick={onCopyProfileUrl}
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <Copy className='h-4 w-4' aria-hidden />
            </HeaderIconButton>
            <HeaderIconButton
              size='xs'
              ariaLabel='Refresh profile'
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
              ariaLabel='Open profile'
              asChild
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <Link
                href={`/${contact!.username}`}
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
            ariaLabel='Close contact sidebar'
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
