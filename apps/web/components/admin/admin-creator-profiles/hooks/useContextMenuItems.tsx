'use client';

/**
 * Context Menu Items Hook
 *
 * Provides context menu items for creator profile rows.
 */

import {
  CheckCircle,
  Copy,
  ExternalLink,
  Mail,
  MailX,
  RefreshCw,
  Send,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { PROFILE_URL } from '@/constants/domains';
import type { AdminCreatorProfileRow, IngestRefreshStatus } from '../types';

export interface ContextMenuDependencies {
  ingestRefreshStatuses: Record<string, IngestRefreshStatus>;
  refreshIngest: (profileId: string) => void;
  toggleVerification: (
    id: string,
    verified: boolean
  ) => Promise<{ success: boolean }>;
  toggleFeatured: (
    id: string,
    featured: boolean
  ) => Promise<{ success: boolean }>;
  toggleMarketing: (
    id: string,
    optOut: boolean
  ) => Promise<{ success: boolean }>;
  openDeleteDialog: (profile: AdminCreatorProfileRow) => void;
  openInviteDialog: (profile: AdminCreatorProfileRow) => void;
}

export function useContextMenuItems({
  ingestRefreshStatuses,
  refreshIngest,
  toggleVerification,
  toggleFeatured,
  toggleMarketing,
  openDeleteDialog,
  openInviteDialog,
}: ContextMenuDependencies) {
  const getContextMenuItems = useCallback(
    (profile: AdminCreatorProfileRow): ContextMenuItemType[] => {
      const items: ContextMenuItemType[] = [];

      // Refresh ingest (if available)
      const hasIngestStatus = Object.prototype.hasOwnProperty.call(
        ingestRefreshStatuses,
        profile.id
      );
      if (hasIngestStatus) {
        const refreshIngestStatus = ingestRefreshStatuses[profile.id] ?? 'idle';
        items.push(
          {
            id: 'refresh-ingest',
            label: 'Refresh ingest',
            icon: <RefreshCw className='h-3.5 w-3.5' />,
            onClick: () => refreshIngest(profile.id),
            disabled: refreshIngestStatus === 'loading',
          },
          { type: 'separator' as const }
        );
      }

      // Verify/Unverify
      items.push(
        profile.isVerified
          ? {
              id: 'unverify',
              label: 'Unverify creator',
              icon: <XCircle className='h-3.5 w-3.5' />,
              onClick: () => {
                void (async () => {
                  const result = await toggleVerification(profile.id, false);
                  if (result.success) {
                    toast.success('Creator unverified');
                  } else {
                    toast.error('Failed to unverify creator');
                  }
                })();
              },
            }
          : {
              id: 'verify',
              label: 'Verify creator',
              icon: <CheckCircle className='h-3.5 w-3.5' />,
              onClick: () => {
                void (async () => {
                  const result = await toggleVerification(profile.id, true);
                  if (result.success) {
                    toast.success('Creator verified');
                  } else {
                    toast.error('Failed to verify creator');
                  }
                })();
              },
            }
      );

      // Feature/Unfeature
      const isFeatured =
        'isFeatured' in profile ? Boolean(profile.isFeatured) : false;
      items.push(
        {
          id: 'feature',
          label: isFeatured ? 'Unfeature' : 'Feature',
          icon: <Star className='h-3.5 w-3.5' />,
          onClick: () => {
            void (async () => {
              const result = await toggleFeatured(profile.id, !isFeatured);
              if (result.success) {
                toast.success(
                  `Creator ${isFeatured ? 'unfeatured' : 'featured'}`
                );
              } else {
                toast.error(
                  `Failed to ${isFeatured ? 'unfeature' : 'feature'} creator`
                );
              }
            })();
          },
        },
        { type: 'separator' as const }
      );

      // Marketing emails toggle
      const marketingOptOut =
        'marketingOptOut' in profile ? Boolean(profile.marketingOptOut) : false;
      items.push(
        {
          id: 'marketing',
          label: marketingOptOut
            ? 'Enable marketing emails'
            : 'Disable marketing emails',
          icon: marketingOptOut ? (
            <Mail className='h-3.5 w-3.5' />
          ) : (
            <MailX className='h-3.5 w-3.5' />
          ),
          onClick: () => {
            void (async () => {
              const result = await toggleMarketing(
                profile.id,
                !marketingOptOut
              );
              if (!result.success) {
                toast.error('Failed to toggle marketing');
              }
            })();
          },
        },
        {
          id: 'view-profile',
          label: 'View profile',
          icon: <ExternalLink className='h-3.5 w-3.5' />,
          onClick: () => {
            globalThis.open(`${PROFILE_URL}/${profile.username}`, '_blank');
          },
        }
      );

      // Copy claim link & Send invite (if unclaimed and has claim token)
      const claimToken = 'claimToken' in profile ? profile.claimToken : null;
      if (!profile.isClaimed && claimToken) {
        items.push(
          { type: 'separator' as const },
          {
            id: 'copy-claim-link',
            label: 'Copy claim link',
            icon: <Copy className='h-3.5 w-3.5' />,
            onClick: () => {
              void (async () => {
                const claimUrl = `${PROFILE_URL}/claim/${claimToken}`;
                try {
                  await navigator.clipboard.writeText(claimUrl);
                  toast.success('Claim link copied to clipboard');
                } catch {
                  toast.error('Failed to copy claim link');
                  globalThis.prompt('Copy claim link:', claimUrl);
                }
              })();
            },
          },
          {
            id: 'send-invite',
            label: 'Send invite',
            icon: <Send className='h-3.5 w-3.5' />,
            onClick: () => {
              openInviteDialog(profile);
            },
          }
        );
      }

      items.push(
        { type: 'separator' as const },
        {
          id: 'delete',
          label: profile.isClaimed ? 'Delete user' : 'Delete creator',
          icon: <Trash2 className='h-3.5 w-3.5' />,
          destructive: true,
          onClick: () => {
            openDeleteDialog(profile);
          },
        }
      );

      return items;
    },
    [
      ingestRefreshStatuses,
      refreshIngest,
      toggleVerification,
      toggleFeatured,
      toggleMarketing,
      openDeleteDialog,
      openInviteDialog,
    ]
  );

  return { getContextMenuItems };
}
