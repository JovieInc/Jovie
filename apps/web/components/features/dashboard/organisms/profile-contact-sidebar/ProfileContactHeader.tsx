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

type EditingField = 'displayName' | 'username' | null;

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
}

export function ProfileContactHeader({
  displayName,
  username,
  avatarUrl,
  editable = false,
  onDisplayNameChange,
  onUsernameChange,
  onAvatarUpload,
}: ProfileContactHeaderProps) {
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [localDisplayName, setLocalDisplayName] = useState(displayName);
  const [localUsername, setLocalUsername] = useState(username);
  const displayNameRef = useRef<HTMLInputElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);

  // Sync local state when props change (e.g. from chat edit)
  useEffect(() => {
    if (editingField !== 'displayName') {
      setLocalDisplayName(displayName);
    }
  }, [displayName, editingField]);

  useEffect(() => {
    if (editingField !== 'username') {
      setLocalUsername(username);
    }
  }, [username, editingField]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingField === 'displayName') {
      displayNameRef.current?.focus();
      displayNameRef.current?.select();
    }
    if (editingField === 'username') {
      usernameRef.current?.focus();
      usernameRef.current?.select();
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

  const handleUsernameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        const trimmed = localUsername.trim();
        if (trimmed) {
          onUsernameChange?.(trimmed);
        }
        setEditingField(null);
      }
      if (e.key === 'Escape') {
        setLocalUsername(username);
        setEditingField(null);
      }
    },
    [localUsername, username, onUsernameChange]
  );

  const handleUsernameBlur = useCallback(() => {
    const trimmed = localUsername.trim();
    if (trimmed && trimmed !== username) {
      onUsernameChange?.(trimmed);
    }
    setEditingField(null);
  }, [localUsername, username, onUsernameChange]);

  const avatarAlt = displayName ? `${displayName} avatar` : 'Profile avatar';

  return (
    <div className='flex items-center gap-3.5'>
      <ProfileAvatar
        editable={editable}
        avatarUrl={avatarUrl}
        avatarAlt={avatarAlt}
        displayName={displayName}
        onAvatarUpload={onAvatarUpload}
      />

      <div className='min-w-0 flex-1 space-y-1'>
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

        <div className='flex flex-wrap items-center gap-2'>
          <EditableUsername
            editable={editable && Boolean(onUsernameChange)}
            isEditing={editingField === 'username'}
            inputRef={usernameRef}
            value={localUsername}
            onChange={setLocalUsername}
            onKeyDown={handleUsernameKeyDown}
            onBlur={handleUsernameBlur}
            onStartEdit={() => setEditingField('username')}
          />
        </div>
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
        size='md'
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
      size='lg'
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
        className='h-8 rounded-[12px] border-subtle bg-surface-2/80 px-2.5 text-[14px] font-[560]'
      />
    );
  }

  return (
    <button
      type='button'
      className={cn(
        'block w-full truncate text-left text-[14px] font-[560] tracking-[-0.012em] text-primary-token',
        editable &&
          '-mx-1 rounded-[10px] px-1 py-0.5 transition-colors hover:bg-surface-2/80 cursor-text'
      )}
      onClick={editable ? onStartEdit : undefined}
      disabled={!editable}
      aria-label={editable ? 'Click to edit display name' : undefined}
    >
      {value || 'Add display name'}
    </button>
  );
}

function EditableUsername({
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
        aria-label='Username'
        data-1p-ignore
        autoComplete='off'
        value={value}
        onChange={e => {
          const raw = e.target.value;
          onChange(raw.startsWith('@') ? raw.slice(1) : raw);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className='h-7 rounded-full border-subtle bg-surface-2/80 px-2.5 text-[11px]'
      />
    );
  }

  return (
    <button
      type='button'
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-full border border-subtle bg-surface-2/70 px-2.5 py-1 text-[11px] font-medium text-secondary-token',
        editable &&
          'transition-colors hover:border-default hover:bg-surface-1 hover:text-primary-token cursor-text'
      )}
      onClick={editable ? onStartEdit : undefined}
      disabled={!editable}
      aria-label={editable ? 'Click to edit username' : undefined}
    >
      @{value || 'username'}
    </button>
  );
}
