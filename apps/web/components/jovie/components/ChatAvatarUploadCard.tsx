'use client';

import { HostDrawnInput, PlainButton } from '@jovie/ui';
import { Check, ImagePlus, Loader2, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelData,
  usePreviewPanelContext,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { validateAvatarFile } from '@/lib/avatar/validation';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';
import { useAvatarMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';
import './ChatAvatarUploadCard.upload.css';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export function ChatAvatarUploadCard() {
  const { selectedProfile } = useDashboardData();
  const selectedProfileId = selectedProfile?.id;
  const selectedProfileIdRef = useRef(selectedProfileId);
  useEffect(() => {
    selectedProfileIdRef.current = selectedProfileId;
  }, [selectedProfileId]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const previewPanel = usePreviewPanelContext();
  // Snapshot + local object URL for the in-flight optimistic avatar swap.
  const pendingRef = useRef<{
    profileId: string | null;
    snapshot: PreviewPanelData | null;
    objectUrl: string | null;
  }>({ profileId: null, snapshot: null, objectUrl: null });

  const clearObjectUrl = useCallback(() => {
    if (pendingRef.current.objectUrl) {
      URL.revokeObjectURL(pendingRef.current.objectUrl);
      pendingRef.current.objectUrl = null;
    }
  }, []);

  const { mutate: uploadAvatar } = useAvatarMutation({
    profileId: selectedProfileId,
    onSuccess: (avatarUrl: string) => {
      if (pendingRef.current.profileId !== selectedProfileIdRef.current) {
        clearObjectUrl();
        pendingRef.current = {
          profileId: null,
          snapshot: null,
          objectUrl: null,
        };
        setState('idle');
        setError(null);
        return;
      }

      setState('success');

      // Swap the optimistic object URL for the persisted avatar URL.
      if (previewPanel?.previewData) {
        previewPanel.setPreviewData({
          ...previewPanel.previewData,
          avatarUrl,
        });
      }
      clearObjectUrl();
      pendingRef.current = {
        profileId: null,
        snapshot: null,
        objectUrl: null,
      };
    },
    onError: (err: Error) => {
      if (pendingRef.current.profileId !== selectedProfileIdRef.current) {
        clearObjectUrl();
        pendingRef.current = {
          profileId: null,
          snapshot: null,
          objectUrl: null,
        };
        setState('idle');
        setError(null);
        return;
      }

      setState('error');
      setError(err.message || 'Upload failed. Please try again.');

      // Roll back to the pre-upload preview.
      if (pendingRef.current.snapshot && previewPanel) {
        previewPanel.setPreviewData(pendingRef.current.snapshot);
      }
      clearObjectUrl();
      pendingRef.current = {
        profileId: null,
        snapshot: null,
        objectUrl: null,
      };
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!selectedProfileId) {
        setState('error');
        setError('Select a profile before uploading a photo.');
        return;
      }

      const validationError = validateAvatarFile(file);
      if (validationError) {
        setState('error');
        setError(validationError);
        return;
      }
      setState('uploading');
      setError(null);

      // Optimistically show the chosen image in the live preview while it uploads.
      const snapshot = previewPanel?.previewData ?? null;
      const objectUrl = snapshot ? URL.createObjectURL(file) : null;
      pendingRef.current = {
        profileId: selectedProfileId,
        snapshot,
        objectUrl,
      };
      if (snapshot && objectUrl) {
        previewPanel?.setPreviewData({ ...snapshot, avatarUrl: objectUrl });
      }

      uploadAvatar(file);
    },
    [selectedProfileId, uploadAvatar, previewPanel]
  );

  const handleClick = useCallback(() => {
    if (state === 'uploading' || !selectedProfileId) return;
    fileInputRef.current?.click();
  }, [selectedProfileId, state]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRetry = useCallback(() => {
    setState('idle');
    setError(null);
    fileInputRef.current?.click();
  }, []);

  if (state === 'success') {
    return (
      <div className='system-b-chat-avatar-upload-state-card system-b-chat-avatar-upload-state-card-success'>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' aria-hidden='true' />
          <span className='text-sm font-medium'>Profile photo updated</span>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className='system-b-chat-avatar-upload-state-card system-b-chat-avatar-upload-state-card-error'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex min-w-0 items-center gap-2 text-error'>
            <X className='h-4 w-4 shrink-0' aria-hidden='true' />
            <span className='text-sm break-words'>{error}</span>
          </div>
          <PlainButton
            type='button'
            onClick={handleRetry}
            className='chat-avatar-upload-retry flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-error'
          >
            <RotateCw className='h-3 w-3' aria-hidden='true' />
            Retry
          </PlainButton>
        </div>
      </div>
    );
  }

  const uploading = state === 'uploading';

  return (
    <>
      <HostDrawnInput
        ref={fileInputRef}
        type='file'
        accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
        onChange={handleFileChange}
        visuallyHidden
        tabIndex={-1}
        aria-label='Choose Profile Photo File'
      />
      <div className='system-b-chat-avatar-upload-card'>
        <PlainButton
          type='button'
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={uploading || !selectedProfileId}
          data-uploading={uploading ? '' : undefined}
          className={cn(
            'chat-avatar-upload-dropzone system-b-chat-avatar-upload-dropzone',
            isDragOver && 'system-b-chat-avatar-upload-dropzone-active'
          )}
        >
          <div className='flex flex-col items-center gap-3'>
            {uploading ? (
              <>
                <Loader2
                  className='h-8 w-8 animate-spin text-accent'
                  aria-hidden='true'
                />
                <span className='text-sm text-secondary-token'>
                  Uploading...
                </span>
              </>
            ) : (
              <>
                <span className='system-b-chat-avatar-upload-icon-shell'>
                  <ImagePlus
                    className={cn(
                      'h-5 w-5',
                      isDragOver ? 'text-accent' : 'text-tertiary-token'
                    )}
                    aria-hidden='true'
                  />
                </span>
                <div>
                  <span className='text-sm font-medium text-primary-token'>
                    Drop your photo here or click to upload
                  </span>
                  <p className='mt-1 text-xs text-tertiary-token'>
                    JPEG, PNG, WebP, or HEIC
                  </p>
                </div>
              </>
            )}
          </div>
        </PlainButton>
      </div>
    </>
  );
}
