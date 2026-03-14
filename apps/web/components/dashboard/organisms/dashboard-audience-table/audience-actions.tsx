'use client';

import { Bell, Copy, Download, Eye, Phone, UserMinus } from 'lucide-react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { AudienceMember } from '@/types';

// Module-level icon constants — allocated once, reused across all rows and renders.
const ICON_EYE = <Eye className='h-3.5 w-3.5' />;
const ICON_COPY = <Copy className='h-3.5 w-3.5' />;
const ICON_PHONE = <Phone className='h-3.5 w-3.5' />;
const ICON_BELL = <Bell className='h-3.5 w-3.5' />;
const ICON_DOWNLOAD = <Download className='h-3.5 w-3.5' />;
const ICON_USER_MINUS = <UserMinus className='h-3.5 w-3.5' />;

export interface BuildAudienceActionsCallbacks {
  readonly onViewDetails: (member: AudienceMember) => void;
  readonly onCopyEmail: (member: AudienceMember) => void;
  readonly onCopyPhone: (member: AudienceMember) => void;
  readonly onSendNotification: (member: AudienceMember) => void;
  readonly onExportVCard: (member: AudienceMember) => void;
  readonly onBlock: (member: AudienceMember) => void;
  /** Whether blocking is available (requires profileId) */
  readonly canBlock?: boolean;
}

/**
 * Canonical builder for audience member action menus.
 *
 * Returns `ContextMenuItemType[]` that works with:
 * - Right-click context menus (via `TableContextMenu`)
 * - Sidebar overflow menus (via `convertToCommonDropdownItems`)
 */
export function buildAudienceActions(
  member: AudienceMember,
  callbacks: BuildAudienceActionsCallbacks
): ContextMenuItemType[] {
  return [
    // ── View group ──
    {
      id: 'view-details',
      label: 'View details',
      icon: ICON_EYE,
      onClick: () => callbacks.onViewDetails(member),
    },
    // ── Copy group ──
    {
      id: 'copy-email',
      label: 'Copy email',
      icon: ICON_COPY,
      onClick: () => callbacks.onCopyEmail(member),
      disabled: !member.email,
    },
    {
      id: 'copy-phone',
      label: 'Copy phone',
      icon: ICON_PHONE,
      onClick: () => callbacks.onCopyPhone(member),
      disabled: !member.phone,
    },
    {
      id: 'send-notification',
      label: 'Send notification',
      icon: ICON_BELL,
      onClick: () => callbacks.onSendNotification(member),
      disabled: !member.email && !member.phone,
    },
    // ── Export group ──
    { type: 'separator' as const },
    {
      id: 'export-contact',
      label: 'Export as vCard',
      icon: ICON_DOWNLOAD,
      onClick: () => callbacks.onExportVCard(member),
    },
    // ── Destructive group ──
    { type: 'separator' as const },
    {
      id: 'remove-member',
      label: 'Block',
      icon: ICON_USER_MINUS,
      onClick: () => callbacks.onBlock(member),
      disabled: !(callbacks.canBlock ?? true),
      destructive: true,
    },
  ];
}
