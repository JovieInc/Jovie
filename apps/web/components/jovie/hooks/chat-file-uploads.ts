import { buildAudioBlobPath } from '@/lib/audio/blob-path';
import { resolveAudioUploadMime } from '@/lib/audio/constants';
import { uploadPresignedLazy as uploadPresigned } from '@/lib/blob/upload-presigned-lazy';
import type { AudioEntityInference } from '@/lib/chat/infer-audio-entity';
import {
  convertHeicToJpeg,
  isHeicLikeMimeType,
} from '@/lib/images/heic-conversion';
import {
  buildFileBlobPath,
  resolveChatFileUploadMime,
} from '@/lib/media/file-policy';
import type { MediaLifecycleState } from '@/lib/media/lifecycle';

export interface AudioUploadResult {
  readonly fileName: string;
  readonly previewUrl: string;
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly inference: AudioEntityInference;
  readonly prompt: string;
}

type UploadFilePatch = Partial<Omit<AudioUploadResult, 'fileName'>> & {
  readonly status: MediaLifecycleState;
  readonly progress?: number;
  readonly blobUrl?: string;
  readonly mediaType?: string;
  readonly error?: string;
};

export type UploadFileUpdater = (id: string, patch: UploadFilePatch) => void;

/**
 * Verifies a non-audio Blob upload server-side (ownership + magic-byte sniff)
 * before it can be attached to a message. Throws with the server's message on
 * rejection (JOV-5872: chat image/video/document uploads previously skipped
 * this and went straight to `ready`).
 */
async function confirmChatFileUpload(
  blobPathname: string,
  fileName: string,
  fileMimeType: string,
  signal: AbortSignal
): Promise<{ blobUrl: string; contentType: string }> {
  const response = await fetch('/api/chat/files/confirm', {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobPathname, fileName, fileMimeType }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    readonly blobUrl?: string;
    readonly contentType?: string;
    readonly error?: string;
  };
  if (!response.ok || !body.blobUrl) {
    throw new Error(body.error ?? 'File verification failed');
  }
  return {
    blobUrl: body.blobUrl,
    contentType: body.contentType ?? fileMimeType,
  };
}

export async function uploadImageAttachment(
  file: File,
  id: string,
  updateFile: UploadFileUpdater,
  userId: string,
  signal: AbortSignal
): Promise<void> {
  updateFile(id, { status: 'uploading', progress: 0 });
  let previewUrl: string | undefined;
  try {
    let processedFile = file;
    if (isHeicLikeMimeType(file.type)) {
      try {
        processedFile = await convertHeicToJpeg(file);
      } catch {
        updateFile(id, {
          status: 'failed',
          error: 'Could not process HEIC. Try JPEG or PNG.',
        });
        return;
      }
    }

    const uploadMime = resolveChatFileUploadMime(processedFile);
    if (!uploadMime) {
      throw new Error('Unsupported image file type');
    }

    previewUrl = URL.createObjectURL(processedFile);
    const blob = await uploadPresigned(
      buildFileBlobPath('chat', userId, processedFile.name),
      processedFile,
      {
        access: 'public',
        abortSignal: signal,
        handleUploadUrl: '/api/chat/files/upload-token',
        contentType: uploadMime,
      }
    );
    updateFile(id, { status: 'processing' });
    const confirmed = await confirmChatFileUpload(
      blob.pathname,
      processedFile.name,
      uploadMime,
      signal
    );
    updateFile(id, {
      status: 'ready',
      progress: 100,
      blobUrl: confirmed.blobUrl,
      previewUrl,
      mediaType: confirmed.contentType,
    });
  } catch (err) {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    updateFile(id, {
      status: 'failed',
      error:
        err instanceof Error ? err.message : `Failed to upload ${file.name}.`,
    });
  }
}

export async function uploadAudioAttachment(
  file: File,
  id: string,
  updateFile: UploadFileUpdater,
  userId: string,
  signal: AbortSignal,
  onAudioUploaded?: (result: AudioUploadResult) => void
): Promise<void> {
  updateFile(id, { status: 'uploading', progress: 0 });
  try {
    const uploadMime = resolveAudioUploadMime({
      name: file.name,
      type: file.type,
    });
    if (!uploadMime) {
      throw new Error('Unsupported audio file type');
    }

    const blob = await uploadPresigned(
      buildAudioBlobPath('chat', userId, file.name),
      file,
      {
        access: 'public',
        abortSignal: signal,
        handleUploadUrl: '/api/library/audio/upload-token',
        contentType: uploadMime,
      }
    );
    updateFile(id, { status: 'processing' });
    const response = await fetch('/api/chat/audio', {
      signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        fileName: file.name,
        fileMimeType: uploadMime,
        fileSizeBytes: file.size,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      readonly previewUrl?: string;
      readonly releaseId?: string;
      readonly releaseTitle?: string;
      readonly prompt?: string;
      readonly inference?: import('@/lib/chat/infer-audio-entity').AudioEntityInference;
      readonly error?: string;
    };
    if (!response.ok || !body.previewUrl || !body.prompt || !body.inference) {
      throw new Error(body.error ?? 'Audio upload failed');
    }
    onAudioUploaded?.({
      fileName: file.name,
      previewUrl: body.previewUrl,
      releaseId: body.releaseId ?? '',
      releaseTitle: body.releaseTitle ?? '',
      inference: body.inference,
      prompt: body.prompt,
    });
    updateFile(id, {
      status: 'ready',
      progress: 100,
      blobUrl: blob.url,
      previewUrl: body.previewUrl,
      inference: body.inference,
      releaseId: body.releaseId,
      releaseTitle: body.releaseTitle,
      prompt: body.prompt,
    });
  } catch (err) {
    updateFile(id, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  }
}

export async function uploadGenericAttachment(
  file: File,
  id: string,
  updateFile: UploadFileUpdater,
  userId: string,
  signal: AbortSignal
): Promise<void> {
  updateFile(id, { status: 'uploading', progress: 0 });
  try {
    const uploadMime = resolveChatFileUploadMime(file);
    if (!uploadMime) {
      throw new Error('Unsupported file type');
    }
    const blob = await uploadPresigned(
      buildFileBlobPath('chat', userId, file.name),
      file,
      {
        access: 'public',
        abortSignal: signal,
        handleUploadUrl: '/api/chat/files/upload-token',
        contentType: uploadMime,
      }
    );
    updateFile(id, { status: 'processing' });
    const confirmed = await confirmChatFileUpload(
      blob.pathname,
      file.name,
      uploadMime,
      signal
    );
    updateFile(id, {
      status: 'ready',
      progress: 100,
      blobUrl: confirmed.blobUrl,
      mediaType: confirmed.contentType,
    });
  } catch (err) {
    updateFile(id, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  }
}
