import { URL } from 'node:url';
import type { SubmissionImageAsset } from '../types';

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function hasSupportedImageExtension(filename: string): boolean {
  const normalized = filename.toLowerCase();
  return (
    normalized.endsWith('.jpg') ||
    normalized.endsWith('.jpeg') ||
    normalized.endsWith('.png')
  );
}

function normalizeExtensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/png') {
    return 'png';
  }

  return 'jpg';
}

export function ensureAbsoluteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateSubmissionImageAsset(
  asset: SubmissionImageAsset
): string[] {
  const issues: string[] = [];

  if (!ensureAbsoluteUrl(asset.url)) {
    issues.push(`${asset.filename}: asset URL must be absolute`);
  }

  if (!SUPPORTED_IMAGE_MIME_TYPES.has(asset.mimeType)) {
    issues.push(`${asset.filename}: unsupported mime type ${asset.mimeType}`);
  }

  if (!hasSupportedImageExtension(asset.filename)) {
    issues.push(`${asset.filename}: unsupported image extension`);
  }

  return issues;
}

export function validateXperiArtworkAttachment(
  asset: SubmissionImageAsset,
  referenceId: string
): string[] {
  const issues = validateSubmissionImageAsset(asset);
  const expectedStem = referenceId.trim();
  const expectedExtension = normalizeExtensionFromMimeType(asset.mimeType);
  const normalizedFilename = asset.filename.trim().toLowerCase();
  const expectedFilename = `${expectedStem.toLowerCase()}.${expectedExtension}`;

  if (normalizedFilename !== expectedFilename) {
    issues.push(
      `${asset.filename}: cover art filename must match ${expectedStem}.${expectedExtension}`
    );
  }

  return issues;
}
