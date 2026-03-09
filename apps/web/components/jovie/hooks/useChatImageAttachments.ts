'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { validateAvatarFile } from '@/lib/avatar/validation';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';
import {
  convertHeicToJpeg,
  isHeicLikeMimeType,
} from '@/lib/images/heic-conversion';
import type { FileUIPart } from '../types';

/** Maximum number of images per message. */
const MAX_IMAGES_PER_MESSAGE = 4;

/** Maximum file size for chat image attachments (10 MB). */
const CHAT_IMAGE_MAX_SIZE = 10 * 1024 * 1024;

export interface PendingImage {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  /** Object URL for local preview (revoked on cleanup). */
  readonly previewUrl: string;
  /** Base64 data URL for sending via AI SDK. */
  readonly dataUrl: string;
}

interface UseChatImageAttachmentsOptions {
  readonly onError: (message: string) => void;
  readonly disabled?: boolean;
}

export interface UseChatImageAttachmentsReturn {
  readonly pendingImages: PendingImage[];
  readonly isDragOver: boolean;
  readonly isProcessing: boolean;
  readonly addFiles: (files: FileList | File[]) => void;
  readonly removeImage: (id: string) => void;
  readonly clearImages: () => void;
  readonly toFileUIParts: () => FileUIPart[];
  /** Attach this ref to the drop zone container. Drag events are bound via useEffect. */
  readonly dropZoneRef: React.RefObject<HTMLDivElement | null>;
}

function generateId(): string {
  return crypto.randomUUID();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function useChatImageAttachments({
  onError,
  disabled = false,
}: UseChatImageAttachmentsOptions): UseChatImageAttachmentsReturn {
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Stable ref for addFiles so the useEffect drag listener doesn't go stale
  const addFilesRef = useRef<(files: FileList | File[]) => void>(() => {});

  // Keep a ref to pendingImages so cleanup captures the latest value
  const pendingImagesRef = useRef(pendingImages);
  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  // Revoke object URLs on unmount
  useEffect(
    () => () => {
      pendingImagesRef.current.forEach(img => {
        if (img.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
    },
    []
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      const results: PendingImage[] = [];

      for (const file of files) {
        const validationError = validateAvatarFile(
          file,
          CHAT_IMAGE_MAX_SIZE,
          SUPPORTED_IMAGE_MIME_TYPES
        );
        if (validationError) {
          onError(validationError);
          continue;
        }

        try {
          // Convert HEIC/HEIF to JPEG before sending to the AI model,
          // which only supports JPEG, PNG, GIF, and WebP (JOV-749).
          let processedFile = file;
          if (isHeicLikeMimeType(file.type)) {
            try {
              processedFile = await convertHeicToJpeg(file);
            } catch {
              onError(
                'Could not process this HEIC photo. Please try a JPEG or PNG image.'
              );
              continue;
            }
          }

          const dataUrl = await readFileAsDataUrl(processedFile);
          const previewUrl = URL.createObjectURL(processedFile);
          results.push({
            id: generateId(),
            name: processedFile.name,
            mediaType: processedFile.type,
            previewUrl,
            dataUrl,
          });
        } catch {
          onError(`Failed to read ${file.name}. Please try again.`);
        }
      }

      if (results.length > 0) {
        setPendingImages(prev => {
          const remaining = MAX_IMAGES_PER_MESSAGE - prev.length;
          return [...prev, ...results.slice(0, remaining)];
        });
      }

      setIsProcessing(false);
    },
    [onError]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (disabled) return;

      const fileArray = Array.from(files);
      const imageFiles = fileArray.filter(f => f.type.startsWith('image/'));

      if (imageFiles.length === 0) {
        onError('Please select image files only.');
        return;
      }

      const currentCount = pendingImagesRef.current.length;
      const remaining = MAX_IMAGES_PER_MESSAGE - currentCount;
      if (remaining <= 0) {
        onError(
          `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`
        );
        return;
      }

      const toAdd = imageFiles.slice(0, remaining);
      if (imageFiles.length > remaining) {
        onError(
          `Only ${remaining} more image${remaining === 1 ? '' : 's'} can be added (max ${MAX_IMAGES_PER_MESSAGE}).`
        );
      }

      setIsProcessing(true);
      processFiles(toAdd).catch(() => {});
    },
    [disabled, onError, processFiles]
  );

  // Keep the ref in sync for useEffect drag listeners
  useEffect(() => {
    addFilesRef.current = addFiles;
  }, [addFiles]);

  const removeImage = useCallback((id: string) => {
    setPendingImages(prev => {
      const image = prev.find(img => img.id === id);
      if (image?.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return prev.filter(img => img.id !== id);
    });
  }, []);

  const clearImages = useCallback(() => {
    setPendingImages(prev => {
      prev.forEach(img => {
        if (img.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
      return [];
    });
  }, []);

  const toFileUIParts = useCallback(
    () =>
      pendingImages.map(img => ({
        type: 'file' as const,
        mediaType: img.mediaType,
        url: img.dataUrl,
      })),
    [pendingImages]
  );

  // Bind drag-and-drop events via useEffect to avoid a11y lint issues on static elements.
  // The file picker button is the accessible alternative; drag-and-drop is progressive enhancement.
  useEffect(() => {
    const el = dropZoneRef.current;
    if (!el) return;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!el.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const { files } = e.dataTransfer ?? {};
      if (files?.length) {
        addFilesRef.current(files);
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
    pendingImages,
    isDragOver,
    isProcessing,
    addFiles,
    removeImage,
    clearImages,
    toFileUIParts,
    dropZoneRef,
  };
}
