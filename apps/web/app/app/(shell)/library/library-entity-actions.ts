import {
  Archive,
  ArchiveRestore,
  Check,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck2,
  ImageIcon,
  Link2,
  type LucideIcon,
  Pause,
  PlayCircle,
  Share2,
  Video,
} from 'lucide-react';
import { createElement, isValidElement, type ReactNode } from 'react';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import type { ContextMenuItemType } from '@/components/organisms/table';
import {
  formatLibraryApprovalStatus,
  LIBRARY_APPROVAL_STATUSES,
  type LibraryApprovalStatus,
} from '@/lib/library/approval-status';
import {
  buildUTMContext,
  getUTMShareActionMenuItems,
} from '@/lib/utm/share-menu-items';
import type { LibraryReleaseAsset } from './library-data';

export const LIBRARY_ENTITY_ACTION_ORDER = [
  'approval-status',
  'profile-visibility',
  'play-preview',
  'open-video',
  'open-artwork',
  'open-primary',
  'copy',
  'archive',
  'restore',
] as const;

export type LibraryEntityActionId =
  | (typeof LIBRARY_ENTITY_ACTION_ORDER)[number]
  | `approval-status:${LibraryApprovalStatus}`
  | `profile-visibility:${LibraryEntityProfileVisibility}`
  | 'copy-share-link'
  | 'copy-tracked-link'
  | 'copy-title'
  | 'copy-artist'
  | 'copy-upc'
  | 'copy-isrc'
  | `utm-share-${string}`;

export type LibraryEntityActionAuthority = 'none' | 'profile-owner';
export type LibraryEntityProfileVisibility = 'visible' | 'hidden';
export type LibraryEntityLifecycleStatus = 'active' | 'archived';

export interface LibraryEntityAction {
  readonly id: LibraryEntityActionId;
  readonly label: string;
  readonly icon: LucideIcon | ReactNode;
  readonly authority: LibraryEntityActionAuthority;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly destructive: boolean;
  readonly onExecute?: () => void | Promise<void>;
  readonly children?: readonly LibraryEntityAction[];
}

export interface BuildLibraryEntityActionsOptions {
  readonly asset: LibraryReleaseAsset;
  readonly profileId: string | null;
  readonly isPreviewPlaying: boolean;
  readonly isApprovalSaving: boolean;
  readonly profileVisibility?: {
    readonly value: LibraryEntityProfileVisibility;
    readonly isSaving: boolean;
    readonly onChange: (
      asset: LibraryReleaseAsset,
      visibility: LibraryEntityProfileVisibility
    ) => Promise<void>;
  };
  readonly lifecycle?: {
    readonly value: LibraryEntityLifecycleStatus;
    readonly isSaving: boolean;
    readonly onChange: (
      asset: LibraryReleaseAsset,
      status: LibraryEntityLifecycleStatus
    ) => Promise<void>;
  };
  readonly onTogglePreview: (asset: LibraryReleaseAsset) => void;
  readonly onApprovalStatusChange: (
    asset: LibraryReleaseAsset,
    approvalStatus: LibraryApprovalStatus
  ) => Promise<void>;
  readonly openUrl?: (url: string) => void;
  readonly copyText?: (value: string) => void | Promise<void>;
}

function buildLifecycleAction({
  asset,
  profileId,
  lifecycle,
}: Pick<
  BuildLibraryEntityActionsOptions,
  'asset' | 'profileId' | 'lifecycle'
>): LibraryEntityAction | null {
  if (!lifecycle) return null;

  const isArchived = lifecycle.value === 'archived';
  const nextStatus: LibraryEntityLifecycleStatus = isArchived
    ? 'active'
    : 'archived';
  const unavailableReason = !profileId
    ? 'Requires an owned creator profile'
    : lifecycle.isSaving
      ? isArchived
        ? 'Restoring release'
        : 'Archiving release'
      : undefined;

  return {
    id: isArchived ? 'restore' : 'archive',
    label: isArchived ? 'Restore' : 'Archive',
    icon: isArchived ? ArchiveRestore : Archive,
    authority: 'profile-owner',
    disabled: Boolean(unavailableReason),
    disabledReason: unavailableReason,
    destructive: !isArchived,
    onExecute: () => lifecycle.onChange(asset, nextStatus),
  };
}

function buildProfileVisibilityAction({
  asset,
  profileId,
  profileVisibility,
}: Pick<
  BuildLibraryEntityActionsOptions,
  'asset' | 'profileId' | 'profileVisibility'
>): LibraryEntityAction | null {
  if (!profileVisibility) return null;

  const unavailableReason = !profileId
    ? 'Requires an owned creator profile'
    : profileVisibility.isSaving
      ? 'Saving profile visibility'
      : undefined;

  return {
    id: 'profile-visibility',
    label: 'Visibility',
    icon: Eye,
    authority: 'profile-owner',
    disabled: false,
    destructive: false,
    children: (['visible', 'hidden'] as const).map(visibility => {
      const isCurrent = visibility === profileVisibility.value;
      return {
        id: `profile-visibility:${visibility}`,
        label:
          visibility === 'visible' ? 'Shown on Profile' : 'Hidden from Profile',
        icon: isCurrent ? Check : visibility === 'visible' ? Eye : EyeOff,
        authority: 'profile-owner',
        disabled: Boolean(unavailableReason) || isCurrent,
        disabledReason:
          unavailableReason ??
          (isCurrent ? 'Current profile visibility' : undefined),
        destructive: false,
        onExecute: () => profileVisibility.onChange(asset, visibility),
      } satisfies LibraryEntityAction;
    }),
  };
}

function defaultOpenUrl(url: string): void {
  globalThis.open(url, '_blank', 'noopener,noreferrer');
}

function defaultCopyText(value: string): void {
  void globalThis.navigator?.clipboard?.writeText(value);
}

function buildApprovalActions({
  asset,
  profileId,
  isApprovalSaving,
  onApprovalStatusChange,
}: Pick<
  BuildLibraryEntityActionsOptions,
  'asset' | 'profileId' | 'isApprovalSaving' | 'onApprovalStatusChange'
>): LibraryEntityAction {
  const unavailableReason = !profileId
    ? 'Requires an owned creator profile'
    : isApprovalSaving
      ? 'Saving approval status'
      : undefined;

  return {
    id: 'approval-status',
    label: 'Status',
    icon: FileCheck2,
    authority: 'profile-owner',
    disabled: false,
    destructive: false,
    children: LIBRARY_APPROVAL_STATUSES.map(status => {
      const isCurrent = status === asset.approvalStatus;
      return {
        id: `approval-status:${status}`,
        label: formatLibraryApprovalStatus(status),
        icon: isCurrent ? Check : Circle,
        authority: 'profile-owner',
        disabled: Boolean(unavailableReason) || isCurrent,
        disabledReason:
          unavailableReason ??
          (isCurrent ? 'Current approval status' : undefined),
        destructive: false,
        onExecute: () => onApprovalStatusChange(asset, status),
      };
    }),
  };
}

function tableActionToLibraryEntityAction(
  action: TableActionMenuItem
): LibraryEntityAction {
  return {
    id: action.id as LibraryEntityActionId,
    label: action.label,
    icon: action.icon ?? Link2,
    authority: 'none',
    disabled: Boolean(action.disabled),
    destructive: action.variant === 'destructive',
    onExecute: action.onClick,
    children: action.children?.map(tableActionToLibraryEntityAction),
  };
}

function buildCopyAction({
  asset,
  copyText,
}: Pick<BuildLibraryEntityActionsOptions, 'asset'> & {
  readonly copyText: NonNullable<BuildLibraryEntityActionsOptions['copyText']>;
}): LibraryEntityAction {
  const children: LibraryEntityAction[] = [];
  const shareUrl = asset.share?.shareUrl;

  if (shareUrl) {
    children.push({
      id: 'copy-share-link',
      label: 'Share Link',
      icon: Share2,
      authority: 'none',
      disabled: false,
      destructive: false,
      onExecute: () => copyText(shareUrl),
    });

    const trackedLinkMenu = getUTMShareActionMenuItems({
      smartLinkUrl: shareUrl,
      context: buildUTMContext({
        smartLinkUrl: shareUrl,
        releaseSlug: asset.share?.shareSlug ?? asset.id,
        releaseTitle: asset.title,
        artistName: asset.artist,
        releaseDate: asset.releaseDate ?? undefined,
      }),
    }).at(0);

    if (trackedLinkMenu) {
      children.push({
        ...tableActionToLibraryEntityAction(trackedLinkMenu),
        id: 'copy-tracked-link',
        label: 'Tracked Link',
      });
    }
  }

  children.push({
    id: 'copy-title',
    label: 'Title',
    icon: Copy,
    authority: 'none',
    disabled: false,
    destructive: false,
    onExecute: () => copyText(asset.title),
  });

  if (asset.artist && asset.artist !== 'Unknown Artist') {
    children.push({
      id: 'copy-artist',
      label: 'Artist',
      icon: Copy,
      authority: 'none',
      disabled: false,
      destructive: false,
      onExecute: () => copyText(asset.artist),
    });
  }

  if (asset.primaryIsrc) {
    const primaryIsrc = asset.primaryIsrc;
    children.push({
      id: 'copy-isrc',
      label: 'ISRC',
      icon: Copy,
      authority: 'none',
      disabled: false,
      destructive: false,
      onExecute: () => copyText(primaryIsrc),
    });
  }

  if (asset.upc) {
    const upc = asset.upc;
    children.push({
      id: 'copy-upc',
      label: 'UPC',
      icon: Copy,
      authority: 'none',
      disabled: false,
      destructive: false,
      onExecute: () => copyText(upc),
    });
  }

  return {
    id: 'copy',
    label: 'Copy',
    icon: Copy,
    authority: 'none',
    disabled: false,
    destructive: false,
    children,
  };
}

export function buildLibraryEntityActions({
  asset,
  profileId,
  isPreviewPlaying,
  isApprovalSaving,
  profileVisibility,
  lifecycle,
  onTogglePreview,
  onApprovalStatusChange,
  openUrl = defaultOpenUrl,
  copyText = defaultCopyText,
}: BuildLibraryEntityActionsOptions): LibraryEntityAction[] {
  const primaryHref = asset.primaryActionHref ?? asset.smartLinkPath;
  const actions: LibraryEntityAction[] = [
    buildApprovalActions({
      asset,
      profileId,
      isApprovalSaving,
      onApprovalStatusChange,
    }),
  ];
  const profileVisibilityAction = buildProfileVisibilityAction({
    asset,
    profileId,
    profileVisibility,
  });
  if (profileVisibilityAction) {
    actions.push(profileVisibilityAction);
  }

  if (asset.previewUrl) {
    actions.push({
      id: 'play-preview',
      label: isPreviewPlaying ? 'Pause Preview' : 'Play Preview',
      icon: isPreviewPlaying ? Pause : PlayCircle,
      authority: 'none',
      disabled: false,
      destructive: false,
      onExecute: () => onTogglePreview(asset),
    });
  }

  const videoUrl = asset.videoUrl;
  if (videoUrl) {
    actions.push({
      id: 'open-video',
      label: 'Open Video',
      icon: Video,
      authority: 'none',
      disabled: false,
      destructive: false,
      onExecute: () => openUrl(videoUrl),
    });
  }

  const artworkUrl = asset.artworkUrl;
  if (artworkUrl) {
    actions.push({
      id: 'open-artwork',
      label: 'Open Artwork',
      icon: ImageIcon,
      authority: 'none',
      disabled: false,
      destructive: false,
      onExecute: () => openUrl(artworkUrl),
    });
  }

  actions.push({
    id: 'open-primary',
    label: asset.primaryActionLabel ?? 'Open Smart Link',
    icon: ExternalLink,
    authority: 'none',
    disabled: false,
    destructive: false,
    onExecute: () => openUrl(primaryHref),
  });

  actions.push(buildCopyAction({ asset, copyText }));

  const lifecycleAction = buildLifecycleAction({
    asset,
    profileId,
    lifecycle,
  });
  if (lifecycleAction) {
    actions.push(lifecycleAction);
  }

  return actions;
}

function toContextMenuItem(action: LibraryEntityAction): ContextMenuItemType {
  const icon = isValidElement(action.icon)
    ? action.icon
    : createElement(action.icon as LucideIcon, {
        className: 'h-3.5 w-3.5',
        'aria-hidden': true,
      });

  if (action.children) {
    return {
      id: action.id,
      label: action.label,
      icon,
      disabled: action.disabled,
      items: action.children.map(toContextMenuItem),
    };
  }

  return {
    id: action.id,
    label: action.label,
    icon,
    disabled: action.disabled,
    subText: action.disabledReason,
    destructive: action.destructive,
    onClick: () => {
      void action.onExecute?.();
    },
  };
}

export function libraryEntityActionsToContextMenuItems(
  actions: readonly LibraryEntityAction[]
): ContextMenuItemType[] {
  return actions.map(toContextMenuItem);
}
