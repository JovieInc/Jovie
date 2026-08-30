'use client';

import { uploadPresigned } from '@vercel/blob/client';
import { captureVideoFileName } from '@/lib/capture/account-video';
import type { ScreenRecording } from '@/lib/capture/record-screen';
import type {
  WorkflowCaptureMutation,
  WorkflowCaptureReceipt,
} from './contract';

interface CaptureApiResponse {
  readonly ok?: boolean;
  readonly error?: string;
  readonly receipt?: WorkflowCaptureReceipt;
  readonly uploadPathPrefix?: string;
}

async function readCaptureResponse(response: Response) {
  const body = (await response.json()) as CaptureApiResponse;
  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? 'Workflow capture request failed');
  }
  return body;
}

async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure file hashing is unavailable in this window');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer()
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function mutateWorkflowCaptureClient(
  captureId: string,
  mutation: WorkflowCaptureMutation
): Promise<WorkflowCaptureReceipt> {
  const response = await fetch(`/api/workflow-captures/${captureId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mutation),
  });
  const body = await readCaptureResponse(response);
  if (!body.receipt) throw new Error('Workflow capture receipt missing');
  return body.receipt;
}

export async function uploadWorkflowCapture(
  captureId: string,
  recording: ScreenRecording
): Promise<WorkflowCaptureReceipt> {
  const details = await readCaptureResponse(
    await fetch(`/api/workflow-captures/${captureId}`, {
      cache: 'no-store',
    })
  );
  if (!details.uploadPathPrefix) {
    throw new Error('Workflow capture upload path missing');
  }
  const blob = await uploadPresigned(
    `${details.uploadPathPrefix}${captureVideoFileName('workflow_capture', new Date())}`,
    recording.file,
    {
      access: 'private',
      handleUploadUrl: `/api/workflow-captures/${captureId}/upload-token`,
    }
  );
  return mutateWorkflowCaptureClient(captureId, {
    action: 'confirm-upload',
    blobUrl: blob.url,
    pathname: blob.pathname,
    sha256: await sha256(recording.file),
    byteSize: recording.byteSize,
    durationMs: recording.durationMs,
  });
}

export function workflowCaptureMediaPath(captureId: string): string {
  return `/api/workflow-captures/${captureId}/media`;
}
