'use client';

import { Input } from '@jovie/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { cn } from '@/lib/utils';

type EditingField = 'displayName' | null;

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
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [localDisplayName, setLocalDisplayName] = useState(displayName);
  const displayNameRef = useRef<HTMLInputElement | null>(null);

  // Sync local state when props change (e.g. from chat edit)
  useEffect(() => {
    if (editingField !== 'displayName') {
      setLocalDisplayName(displayName);
    }
  }, [displayName, editingField]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingField === 'displayName') {
      displayNameRef.current?.focus();
      displayNameRef.current?.select();
    }
  }, [editingField]);

  const handleDisplayNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        const trimmed = localDisplayName.trim();
        if (trimmed) {
          onDisplayNameChange?.(trimmed);
        }
        setEditingField(null);
      }
      if (e.key === 'Escape') {
        setLocalDisplayName(displayName);
        setEditingField(null);
      }
    },
    [localDisplayName, displayName, onDisplayNameChange]
  );

  const handleDisplayNameBlur = useCallback(() => {
    const trimmed = localDisplayName.trim();
    if (trimmed && trimmed !== displayName) {
      onDisplayNameChange?.(trimmed);
    }
    setEditingField(null);
  }, [localDisplayName, displayName, onDisplayNameChange]);

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
        <EditableDisplayName
          editable={editable}
          isEditing={editingField === 'displayName'}
          inputRef={displayNameRef}
          value={localDisplayName}
          onChange={setLocalDisplayName}
          onKeyDown={handleDisplayNameKeyDown}
          onBlur={handleDisplayNameBlur}
          onStartEdit={() => setEditingField('displayName')}
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

function EditableDisplayName({
  editable,
  isEditing,
  inputRef,
  value,
  onChange,
  onKeyDown,
  onBlur,
  onStartEdit,
}: {
  readonly editable: boolean;
  readonly isEditing: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onKeyDown: (e: React.KeyboardEvent) => void;
  readonly onBlur: () => void;
  readonly onStartEdit: () => void;
}) {
  if (editable && isEditing) {
    return (
      <Input
        ref={inputRef}
        type='text'
        aria-label='Edit display name'
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className='h-8 rounded-[8px] border-(--linear-app-frame-seam) bg-surface-0 px-2.5 text-[14px] font-[560]'
      />
    );
  }

  return (
    <button
      type='button'
      className={cn(
        'block w-full truncate text-left text-[13px] font-[590] leading-[15px] tracking-[-0.01em] text-primary-token',
        editable &&
          '-mx-1 rounded-[8px] px-1 py-0.5 transition-colors hover:bg-surface-0 cursor-text'
      )}
      onClick={editable ? onStartEdit : undefined}
      disabled={!editable}
      aria-label={editable ? 'Click to edit display name' : undefined}
    >
      {value || 'Add display name'}
    </button>
  );
}
