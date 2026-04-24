'use client';

import { toast } from 'sonner';
import { DrawerEditableTextField } from '@/components/molecules/drawer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';

export interface ProfileContactHeaderProps {
  readonly displayName: string;
  readonly username: string;
  readonly avatarUrl: string | null;
  /** When true, fields become click-to-edit and avatar is uploadable */
  readonly editable?: boolean;
  /** Called when display name is changed (debounced save handled by parent) */
  readonly onDisplayNameChange?: (value: string) => void;
  /** Called when username is changed */
  readonly onUsernameChange?: (value: string) => void;
  /** Called when avatar file is selected */
  readonly onAvatarUpload?: (file: File) => Promise<string>;
  /** Total number of releases for metadata display */
  readonly releaseCount?: number;
  /** Total number of links for metadata display */
  readonly linkCount?: number;
}

export function ProfileContactHeader({
  displayName,
  username,
  avatarUrl,
  editable = false,
  onDisplayNameChange,
  onUsernameChange,
  onAvatarUpload,
  releaseCount,
  linkCount,
}: ProfileContactHeaderProps) {
  const avatarAlt = displayName ? `${displayName} avatar` : 'Profile avatar';

  const metaParts: string[] = [];
  if (releaseCount != null && releaseCount > 0) {
    metaParts.push(
      `${releaseCount} ${releaseCount === 1 ? 'release' : 'releases'}`
    );
  }
  if (linkCount != null && linkCount > 0) {
    metaParts.push(`${linkCount} ${linkCount === 1 ? 'link' : 'links'}`);
  }

  return (
    <div className='flex items-start gap-2.5'>
      <ProfileAvatar
        editable={editable}
        avatarUrl={avatarUrl}
        avatarAlt={avatarAlt}
        displayName={displayName}
        onAvatarUpload={onAvatarUpload}
      />

      <div className='min-w-0 flex-1 space-y-px'>
        <DrawerEditableTextField
          label='Display name'
          value={displayName}
          editable={editable && Boolean(onDisplayNameChange)}
          emptyLabel='Add display name'
          onSave={nextValue => {
            if (onDisplayNameChange) {
              onDisplayNameChange(nextValue ?? '');
            }
          }}
          displayClassName='text-[13px] font-semibold leading-[15px] tracking-[-0.01em] text-primary-token'
          emptyClassName='text-tertiary-token'
          inputClassName='h-8 rounded-lg border-(--linear-app-frame-seam) bg-surface-0 px-2.5 text-sm font-semibold'
        />

        <div className='truncate text-[11px] leading-[14px] tracking-[-0.005em] text-secondary-token'>
          @{username || 'username'}
        </div>

        {metaParts.length > 0 && (
          <p className='text-[10.5px] leading-[14px] tracking-[0.01em] text-tertiary-token'>
            {metaParts.join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

function ProfileAvatar({
  editable,
  avatarUrl,
  avatarAlt,
  displayName,
  onAvatarUpload,
}: {
  readonly editable: boolean;
  readonly avatarUrl: string | null;
  readonly avatarAlt: string;
  readonly displayName: string;
  readonly onAvatarUpload?: (file: File) => Promise<string>;
}) {
  if (editable && onAvatarUpload) {
    return (
      <AvatarUploadable
        src={avatarUrl}
        alt={avatarAlt}
        name={displayName}
        size='2xl'
        rounded='md'
        uploadable
        onUpload={onAvatarUpload}
        onError={message => {
          toast.error(message || 'Failed to upload avatar. Please try again.');
        }}
        maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
        acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
        showHoverOverlay
      />
    );
  }

  return (
    <AvatarUploadable
      src={avatarUrl}
      alt={avatarAlt}
      name={displayName}
      size='2xl'
      rounded='md'
    />
  );
}
