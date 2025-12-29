import { z } from 'zod';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';

/**
 * Media validation schemas for image and file upload API routes.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in upload endpoints.
 *
 * @see /api/images/upload
 */

// =============================================================================
// Image Upload Schemas
// =============================================================================

/**
 * Image upload validation schema.
 * Used for POST /api/images/upload requests to validate uploaded image files.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const imageUploadSchema = z.object({
  /** Original filename of the uploaded image (must not be empty) */
  filename: z.string().min(1),
  /** MIME type of the uploaded image (must be a supported image format) */
  contentType: z.enum(SUPPORTED_IMAGE_MIME_TYPES),
});

/**
 * Inferred TypeScript type for image upload payloads.
 */
export type ImageUploadPayload = z.infer<typeof imageUploadSchema>;
