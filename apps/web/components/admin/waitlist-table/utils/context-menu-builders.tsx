'use client';

import { ClipboardList, ExternalLink, Mail, User } from 'lucide-react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';

/**
 * Creates copy-related menu items (email, name)
 */
export function createCopyMenuItems(
  entry: WaitlistEntryRow,
  copyToClipboard: (text: string, label: string) => void
): ContextMenuItemType[] {
  return [
    {
      id: 'copy-email',
      label: 'Copy Email',
      icon: <Mail className='h-3.5 w-3.5' />,
      onClick: () => copyToClipboard(entry.email, 'email'),
    },
    {
      id: 'copy-name',
      label: 'Copy Name',
      icon: <User className='h-3.5 w-3.5' />,
      onClick: () => copyToClipboard(entry.fullName, 'name'),
    },
  ];
}

/**
 * Creates external link menu items (social media, Spotify)
 */
export function createExternalLinkMenuItems(
  entry: WaitlistEntryRow
): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [
    {
      id: 'open-social',
      label: 'Open Primary Social',
      icon: <ExternalLink className='h-3.5 w-3.5' />,
      onClick: () => {
        globalThis.open(
          entry.primarySocialUrlNormalized,
          '_blank',
          'noopener,noreferrer'
        );
      },
    },
  ];

  // Add Spotify link if available
  if (entry.spotifyUrlNormalized) {
    items.push({
      id: 'open-spotify',
      label: 'Open Spotify',
      icon: <ExternalLink className='h-3.5 w-3.5' />,
      onClick: () => {
        globalThis.open(
          entry.spotifyUrlNormalized!,
          '_blank',
          'noopener,noreferrer'
        );
      },
    });
  }

  return items;
}

/**
 * Creates status action menu items (approve)
 */
export function createStatusActionMenuItems(
  entry: WaitlistEntryRow,
  approveEntry: (id: string) => Promise<void>
): ContextMenuItemType[] {
  const isApproved = entry.status === 'invited' || entry.status === 'claimed';

  return [
    {
      id: 'approve',
      label: isApproved ? 'Approved' : 'Approve',
      icon: <ClipboardList className='h-3.5 w-3.5' />,
      onClick: () => {
        if (!isApproved) {
          void approveEntry(entry.id);
        }
      },
      disabled: isApproved,
    },
  ];
}

/**
 * Builds complete context menu items by composing individual sections
 */
export function buildContextMenuItems(
  entry: WaitlistEntryRow,
  copyToClipboard: (text: string, label: string) => void,
  approveEntry: (id: string) => Promise<void>
): ContextMenuItemType[] {
  return [
    ...createCopyMenuItems(entry, copyToClipboard),
    { type: 'separator' },
    ...createExternalLinkMenuItems(entry),
    { type: 'separator' },
    ...createStatusActionMenuItems(entry, approveEntry),
  ];
}
