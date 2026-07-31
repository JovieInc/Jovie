import {
  Check,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck2,
  ImageIcon,
  type LucideIcon,
  Pause,
  PlayCircle,
  Share2,
  Video,
} from 'lucide-react';
import { createElement } from 'react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import {
  formatLibraryApprovalStatus,
  LIBRARY_APPROVAL_STATUSES,
  type LibraryApprovalStatus,
} from '@/lib/library/approval-status';
import type { LibraryReleaseAsset } from './library-data';

export const LIBRARY_ENTITY_ACTION_ORDER = [
  'approval-status',
  'profile-visibility',
  'play-preview',
  'open-video',
  'open-artwork',
  'open-primary',
  'copy-share-link',
  'copy-title',
] as const;

export type LibraryEntityActionId =
  | (typeof LIBRARY_ENTITY_ACTION_ORDER)[number]
  | `approval-status:${LibraryApprovalStatus}`;

export type LibraryEntityActionAuthority = 'none' | 'profile-owner';
export type LibraryEntityProfileVisibility = 'visible' | 'hidden';

export interface LibraryEntityAction {
  readonly id: LibraryEntityActionId;
  readonly label: string;
  readonly icon: LucideIcon;
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
  readonly onTogglePreview: (asset: LibraryReleaseAsset) => void;
  readonly onApprovalStatusChange: (
    asset: LibraryReleaseAsset,
    approvalStatus: LibraryApprovalStatus
  ) => Promise<void>;
  readonly openUrl?: (url: string) => void;
  readonly copyText?: (value: string) => void | Promise<void>;
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

  const nextVisibility =
    profileVisibility.value === 'visible' ? 'hidden' : 'visible';
  const unavailableReason = !profileId
    ? 'Requires an owned creator profile'
    : profileVisibility.isSaving
      ? 'Saving profile visibility'
      : undefined;

  return {
    id: 'profile-visibility',
    label:
      nextVisibility === 'hidden' ? 'Hide from Profile' : 'Show on Profile',
    icon: nextVisibility === 'hidden' ? EyeOff : Eye,
    authority: 'profile-owner',
    disabled: Boolean(unavailableReason),
    disabledReason: unavailableReason,
    destructive: false,
    onExecute: () => profileVisibility.onChange(asset, nextVisibility),
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
    label: `Approval: ${formatLibraryApprovalStatus(asset.approvalStatus)}`,
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

export function buildLibraryEntityActions({
  asset,
  profileId,
  isPreviewPlaying,
  isApprovalSaving,
  profileVisibility,
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

  const shareUrl = asset.share?.shareUrl;
  if (shareUrl) {
    actions.push({
      id: 'copy-share-link',
      label: 'Copy Share Link',
      icon: Share2,
      authority: 'none',
      disabled: false,
      destructive: false,
      onExecute: () => copyText(shareUrl),
    });
  }

  actions.push({
    id: 'copy-title',
    label: 'Copy Title',
    icon: Copy,
    authority: 'none',
    disabled: false,
    destructive: false,
    onExecute: () => copyText(asset.title),
  });

  return actions;
}

function toContextMenuItem(action: LibraryEntityAction): ContextMenuItemType {
  const icon = createElement(action.icon, {
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
