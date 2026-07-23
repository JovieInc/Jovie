'use client';

import { upload } from '@vercel/blob/client';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AUDIO_FILE_ACCEPT,
  canonicalizeAudioFileForUpload,
  validateAudioFile,
} from '@/lib/audio/constants';
import type { AudioEntityInference } from '@/lib/chat/infer-audio-entity';

export type PendingAudioStatus = 'uploading' | 'ready' | 'error';

export interface PendingAudio {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly status: PendingAudioStatus;
  readonly error?: string;
  readonly previewUrl?: string;
  readonly inference?: AudioEntityInference;
  readonly releaseId?: string;
  readonly releaseTitle?: string;
  readonly prompt?: string;
}

export interface ChatAudioUploadResult {
  readonly fileName: string;
  readonly previewUrl: string;
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly inference: AudioEntityInference;
  readonly prompt: string;
}

interface UseChatAudioAttachmentsOptions {
  readonly onError: (message: string) => void;
  readonly onUploaded?: (result: ChatAudioUploadResult) => void;
  readonly disabled?: boolean;
}

export interface UseChatAudioAttachmentsReturn {
  readonly pendingAudio: PendingAudio | null;
  readonly isDragOver: boolean;
  readonly isProcessing: boolean;
  readonly addFiles: (files: FileList | File[]) => void;
  readonly clearAudio: () => void;
  readonly dropZoneRef: React.RefObject<HTMLDivElement | null>;
  readonly accept: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

export function useChatAudioAttachments({
  onError,
  onUploaded,
  disabled = false,
}: UseChatAudioAttachmentsOptions): UseChatAudioAttachmentsReturn {
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const addFilesRef = useRef<(files: FileList | File[]) => void>(() => {});

  const uploadFile = useCallback(
    async (file: File) => {
      const validationError = validateAudioFile(file);
      if (validationError) {
        onError(validationError);
        setPendingAudio({
          id: generateId(),
          name: file.name,
          mediaType: file.type,
          status: 'error',
          error: validationError,
        });
        setIsProcessing(false);
        return;
      }

      const pendingId = generateId();
      setPendingAudio({
        id: pendingId,
        name: file.name,
        mediaType: file.type,
        status: 'uploading',
      });

      try {
        const uploadFile = canonicalizeAudioFileForUpload(file);
        const blob = await upload(uploadFile.name, uploadFile, {
          access: 'public',
          handleUploadUrl: '/api/library/audio/upload-token',
        });

        const response = await fetch('/api/chat/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            fileName: uploadFile.name,
            fileMimeType: uploadFile.type,
            fileSizeBytes: uploadFile.size,
          }),
        });

        const body = (await response.json().catch(() => ({}))) as {
          readonly previewUrl?: string;
          readonly releaseId?: string;
          readonly releaseTitle?: string;
          readonly prompt?: string;
          readonly inference?: AudioEntityInference;
          readonly error?: string;
        };

        if (
          !response.ok ||
          !body.previewUrl ||
          !body.prompt ||
          !body.inference
        ) {
          throw new Error(body.error ?? 'Audio upload failed');
        }

        const result: ChatAudioUploadResult = {
          fileName: file.name,
          previewUrl: body.previewUrl,
          releaseId: body.releaseId ?? '',
          releaseTitle: body.releaseTitle ?? '',
          inference: body.inference,
          prompt: body.prompt,
        };

        onUploaded?.(result);
        setPendingAudio(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Audio upload failed';
        onError(message);
        setPendingAudio({
          id: pendingId,
          name: file.name,
          mediaType: file.type,
          status: 'error',
          error: message,
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [onError, onUploaded]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (disabled || isProcessing) return;

      const fileArray = Array.from(files);
      const audioFiles = fileArray.filter(
        file =>
          file.type.startsWith('audio/') || validateAudioFile(file) === null
      );

      if (audioFiles.length === 0) {
        onError(
          'Please select an audio file (MP3, WAV, FLAC, AIFF, AAC, or M4A).'
        );
        return;
      }

      if (audioFiles.length > 1) {
        onError('Upload one audio file at a time.');
      }

      setIsProcessing(true);
      uploadFile(audioFiles[0]).catch(() => {});
    },
    [disabled, isProcessing, onError, uploadFile]
  );

  useEffect(() => {
    addFilesRef.current = addFiles;
  }, [addFiles]);

  const clearAudio = useCallback(() => {
    setPendingAudio(null);
  }, []);

  useEffect(() => {
    const el = dropZoneRef.current;
    if (!el) return;

    const onDragEnter = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    };

    const onDragLeave = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!el.contains(event.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    };

    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const { files } = event.dataTransfer ?? {};
      if (!files?.length) return;

      const audioFiles = Array.from(files).filter(
        file =>
          file.type.startsWith('audio/') || validateAudioFile(file) === null
      );

      if (audioFiles.length > 0) {
        addFilesRef.current(audioFiles);
      }
    };

    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);

    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [disabled]);

  return {
    pendingAudio,
    isDragOver,
    isProcessing,
    addFiles,
    clearAudio,
    dropZoneRef,
    accept: AUDIO_FILE_ACCEPT,
  };
}
