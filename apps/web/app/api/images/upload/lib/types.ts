/**
 * Image Upload Types
 *
 * Type definitions for the image upload API route.
 */

import type { UploadErrorCode } from './constants';

export interface UploadErrorResponse {
  error: string;
  code: UploadErrorCode;
  retryable?: boolean;
  retryAfter?: number;
}

export type BlobPut = typeof import('@vercel/blob').put;
export type SharpModule = typeof import('sharp');
export type SharpConstructor = SharpModule extends { default: infer D }
  ? D
  : SharpModule;

export type PgErrorInfo = {
  code?: string;
  detail?: string;
  hint?: string;
  schema?: string;
  table?: string;
  constraint?: string;
};
