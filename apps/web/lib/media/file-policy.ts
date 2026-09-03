/**
 * Canonical non-audio file policy (JOV-5872, extends JOV-3685).
 *
 * ONE schema for the kinds, MIME aliases, extensions, size limits and Blob
 * path layout that every upload surface (web, desktop, iOS) must agree on.
 * Audio lives in `@jovie/audio-contracts`; this module composes it so callers
 * have a single entry point for "what can I attach, how big, and where does
 * it live". Values stay literal so generated cross-platform manifests stay
 * exact.
 *
 * Storage is Vercel Blob only. Every uploaded object lives under an
 * owner-scoped prefix so the presigned-token routes can prove ownership
 * before signing, mirroring `lib/audio/blob-path.ts`.
 */

import {
  AUDIO_FILE_ACCEPT,
  getCanonicalAudioMimeType,
  isSupportedAudioFile,
} from '@jovie/audio-contracts';

export const FILE_KINDS = ['image', 'video', 'document', 'archive'] as const;

export type UploadFileKind = (typeof FILE_KINDS)[number];

/** Kind buckets the chat composer renders. Audio is owned by audio-contracts. */
export type ChatFileKind = UploadFileKind | 'audio' | 'other';

/**
 * How the browser hands a format to storage:
 * - `upload`: stored as-is under the canonical MIME.
 * - `convert`: transcoded client-side first (HEIC -> JPEG); never stored as-is.
 * - `expand`: unpacked client-side into member files; never stored as-is.
 */
export type FileTransport = 'upload' | 'convert' | 'expand';

export interface FileFormatDefinition {
  readonly id: string;
  readonly kind: UploadFileKind;
  readonly label: string;
  readonly canonicalMimeType: string;
  readonly mimeTypes: readonly string[];
  readonly extensions: readonly string[];
  readonly transport: FileTransport;
}

export const FILE_FORMAT_REGISTRY = [
  {
    id: 'jpeg',
    kind: 'image',
    label: 'JPEG',
    canonicalMimeType: 'image/jpeg',
    mimeTypes: ['image/jpeg', 'image/jpg'],
    extensions: ['jpg', 'jpeg'],
    transport: 'upload',
  },
  {
    id: 'png',
    kind: 'image',
    label: 'PNG',
    canonicalMimeType: 'image/png',
    mimeTypes: ['image/png'],
    extensions: ['png'],
    transport: 'upload',
  },
  {
    id: 'webp',
    kind: 'image',
    label: 'WebP',
    canonicalMimeType: 'image/webp',
    mimeTypes: ['image/webp'],
    extensions: ['webp'],
    transport: 'upload',
  },
  {
    id: 'avif',
    kind: 'image',
    label: 'AVIF',
    canonicalMimeType: 'image/avif',
    mimeTypes: ['image/avif'],
    extensions: ['avif'],
    transport: 'upload',
  },
  {
    id: 'gif',
    kind: 'image',
    label: 'GIF',
    canonicalMimeType: 'image/gif',
    mimeTypes: ['image/gif'],
    extensions: ['gif'],
    transport: 'upload',
  },
  {
    id: 'tiff',
    kind: 'image',
    label: 'TIFF',
    canonicalMimeType: 'image/tiff',
    mimeTypes: ['image/tiff'],
    extensions: ['tif', 'tiff'],
    transport: 'upload',
  },
  {
    id: 'heic',
    kind: 'image',
    label: 'HEIC',
    canonicalMimeType: 'image/heic',
    mimeTypes: [
      'image/heic',
      'image/heif',
      'image/heic-sequence',
      'image/heif-sequence',
    ],
    extensions: ['heic', 'heif'],
    transport: 'convert',
  },
  {
    id: 'mp4',
    kind: 'video',
    label: 'MP4',
    canonicalMimeType: 'video/mp4',
    mimeTypes: ['video/mp4'],
    extensions: ['mp4', 'm4v'],
    transport: 'upload',
  },
  {
    id: 'mov',
    kind: 'video',
    label: 'MOV',
    canonicalMimeType: 'video/quicktime',
    mimeTypes: ['video/quicktime'],
    extensions: ['mov'],
    transport: 'upload',
  },
  {
    id: 'webm',
    kind: 'video',
    label: 'WebM',
    canonicalMimeType: 'video/webm',
    mimeTypes: ['video/webm'],
    extensions: ['webm'],
    transport: 'upload',
  },
  {
    id: 'avi',
    kind: 'video',
    label: 'AVI',
    canonicalMimeType: 'video/x-msvideo',
    mimeTypes: ['video/x-msvideo', 'video/avi'],
    extensions: ['avi'],
    transport: 'upload',
  },
  {
    id: 'pdf',
    kind: 'document',
    label: 'PDF',
    canonicalMimeType: 'application/pdf',
    mimeTypes: ['application/pdf'],
    extensions: ['pdf'],
    transport: 'upload',
  },
  {
    id: 'txt',
    kind: 'document',
    label: 'TXT',
    canonicalMimeType: 'text/plain',
    mimeTypes: ['text/plain'],
    extensions: ['txt'],
    transport: 'upload',
  },
  {
    id: 'zip',
    kind: 'archive',
    label: 'ZIP',
    canonicalMimeType: 'application/zip',
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    extensions: ['zip'],
    transport: 'expand',
  },
] as const satisfies readonly FileFormatDefinition[];

/** 500 MiB. Covers large video masters; literal for manifest parity. */
export const CHAT_FILE_MAX_FILE_SIZE_BYTES = 524_288_000;

/** 5 GiB per composer batch. */
export const CHAT_FILE_BATCH_MAX_SIZE_BYTES = 5_368_709_120;

export const CHAT_FILE_MAX_FILES_PER_MESSAGE = 20;

export type FileUploadSurface = 'chat' | 'account_video';

export const FILE_UPLOAD_SURFACES = [
  'chat',
  'account_video',
] as const satisfies readonly FileUploadSurface[];

export const FILE_UPLOAD_POLICIES = {
  chat: {
    maxFileSizeBytes: CHAT_FILE_MAX_FILE_SIZE_BYTES,
    kinds: FILE_KINDS,
  },
  account_video: {
    maxFileSizeBytes: CHAT_FILE_MAX_FILE_SIZE_BYTES,
    kinds: ['video'],
  },
} as const satisfies Readonly<
  Record<
    FileUploadSurface,
    {
      readonly maxFileSizeBytes: number;
      readonly kinds: readonly UploadFileKind[];
    }
  >
>;

// Stryker disable all: ESM module initializers execute before Stryker activates
// a mutant; the invariant tests guard these derived constants.
/** Every MIME the browser may hand to storage as-is (transport `upload`). */
export const UPLOADABLE_FILE_CONTENT_TYPES: readonly string[] =
  FILE_FORMAT_REGISTRY.filter(format => format.transport === 'upload').flatMap(
    format => format.mimeTypes
  );

/** `<input accept>` string for the chat composer: files + audio. */
export const CHAT_FILE_ACCEPT = [
  ...FILE_FORMAT_REGISTRY.flatMap(format => format.mimeTypes),
  ...FILE_FORMAT_REGISTRY.flatMap(format =>
    format.extensions.map(extension => `.${extension}`)
  ),
  AUDIO_FILE_ACCEPT,
].join(',');
// Stryker restore all

export interface FileDescriptor {
  readonly name: string;
  readonly type: string;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase().split(';', 1)[0];
}

function extensionFromFileName(fileName: string): string | null {
  const match = fileName
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

export function getFileFormatByMimeType(
  mimeType: string
): FileFormatDefinition | null {
  const normalized = normalizeMimeType(mimeType);
  return (
    FILE_FORMAT_REGISTRY.find(format =>
      (format.mimeTypes as readonly string[]).includes(normalized)
    ) ?? null
  );
}

export function getFileFormatByFileName(
  fileName: string
): FileFormatDefinition | null {
  const extension = extensionFromFileName(fileName);
  if (!extension) return null;
  return (
    FILE_FORMAT_REGISTRY.find(format =>
      (format.extensions as readonly string[]).includes(extension)
    ) ?? null
  );
}

/**
 * Resolves the registry format for a browser File. Blank or
 * `application/octet-stream` MIME falls back to the extension; a contradictory
 * MIME (e.g. `text/plain` on `x.png`) returns null.
 */
export function getFileFormat(
  file: FileDescriptor
): FileFormatDefinition | null {
  const byMimeType = getFileFormatByMimeType(file.type);
  if (byMimeType) return byMimeType;

  const normalized = normalizeMimeType(file.type);
  if (normalized.length > 0 && normalized !== 'application/octet-stream') {
    return null;
  }
  return getFileFormatByFileName(file.name);
}

/** Canonical MIME for an extension, across files and audio. Null if unknown. */
export function getCanonicalMimeTypeByFileName(
  fileName: string
): string | null {
  return (
    getFileFormatByFileName(fileName)?.canonicalMimeType ??
    getCanonicalAudioMimeType(fileName)
  );
}

/** Kind bucket for the composer. Audio wins so audio-contracts owns its rules. */
export function detectChatFileKind(file: FileDescriptor): ChatFileKind {
  if (
    normalizeMimeType(file.type).startsWith('audio/') ||
    isSupportedAudioFile(file)
  ) {
    return 'audio';
  }
  return getFileFormat(file)?.kind ?? 'other';
}

/**
 * Canonical MIME to upload under. Null when the format is not directly
 * uploadable (unknown, or a `convert`/`expand` transport that must be
 * processed client-side first).
 */
export function resolveChatFileUploadMime(file: FileDescriptor): string | null {
  const format = getFileFormat(file);
  if (!format || format.transport !== 'upload') return null;
  return format.canonicalMimeType;
}

/** Named-rule codes for rejected file uploads (JOV-3688 pattern). */
export type FileUploadRuleCode =
  | 'file.supported_types'
  | 'file.max_file_size_bytes';

export type FileUploadCtaAction = 'pick_another' | 'compress';

export interface FileUploadRejection {
  readonly ok: false;
  /** Stable machine id for telemetry + tests */
  readonly code: FileUploadRuleCode;
  /** Named rule shown inline (plain language) */
  readonly rule: string;
  /** Full user-facing sentence */
  readonly message: string;
  readonly cta: {
    readonly label: string;
    readonly action: FileUploadCtaAction;
  };
}

export type FileUploadValidationResult =
  | { readonly ok: true }
  | FileUploadRejection;

function formatMaxSizeMb(maxSizeBytes: number): number {
  return Math.round(maxSizeBytes / (1024 * 1024));
}

function describeRejectedType(file: FileDescriptor): string {
  if (file.type.length > 0) return file.type;
  const extension = extensionFromFileName(file.name);
  return extension ? `.${extension}` : 'unknown type';
}

function supportedLabels(surface: FileUploadSurface): string {
  const kinds = FILE_UPLOAD_POLICIES[surface]
    .kinds as readonly UploadFileKind[];
  return FILE_FORMAT_REGISTRY.filter(format => kinds.includes(format.kind))
    .map(format => format.label)
    .join(', ');
}

/**
 * Structured validation for a non-audio attachment: named failing rule + CTA.
 * Audio files must go through `validateAudioUpload` instead.
 */
export function validateChatFileUpload(
  file: FileDescriptor & { readonly size: number },
  surface: FileUploadSurface = 'chat'
): FileUploadValidationResult {
  const policy = FILE_UPLOAD_POLICIES[surface];
  const format = getFileFormat(file);
  if (
    !format ||
    !(policy.kinds as readonly UploadFileKind[]).includes(format.kind)
  ) {
    const formats = supportedLabels(surface);
    return {
      ok: false,
      code: 'file.supported_types',
      rule: `Supported types: ${formats}`,
      message: `${describeRejectedType(file)} is not supported. Use ${formats}.`,
      cta: { label: 'Choose another file', action: 'pick_another' },
    };
  }

  if (file.size > policy.maxFileSizeBytes) {
    const maxMb = formatMaxSizeMb(policy.maxFileSizeBytes);
    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      code: 'file.max_file_size_bytes',
      rule: `Max file size: ${maxMb} MB`,
      message: `This file is ${fileMb} MB. Files must be ${maxMb} MB or smaller.`,
      cta: { label: 'Choose a smaller file', action: 'compress' },
    };
  }

  return { ok: true };
}

/** MIME types a presigned token may accept for a surface. */
export function getAllowedUploadContentTypes(
  surface: FileUploadSurface
): readonly string[] {
  const kinds = FILE_UPLOAD_POLICIES[surface]
    .kinds as readonly UploadFileKind[];
  return FILE_FORMAT_REGISTRY.filter(
    format => format.transport === 'upload' && kinds.includes(format.kind)
  ).flatMap(format => format.mimeTypes);
}

// ── Blob path layout ──────────────────────────────────────────────────
// jovie/files/<surface>/<userId>/<uuid>-<safe-name>

const JOVIE_FILE_PATH_PREFIX = 'jovie/files';

export function getFileBlobPathPrefix(
  surface: FileUploadSurface,
  userId: string
): string {
  return `${JOVIE_FILE_PATH_PREFIX}/${surface}/${encodeURIComponent(userId)}/`;
}

export function buildFileBlobPath(
  surface: FileUploadSurface,
  userId: string,
  fileName: string
): string {
  const safeName =
    fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ||
    'file';
  return `${getFileBlobPathPrefix(surface, userId)}${crypto.randomUUID()}-${safeName}`;
}

/**
 * Resolves which surface a requested pathname belongs to, or null when it is
 * not under one of the caller's own prefixes (foreign user, root-level name,
 * traversal).
 */
export function resolveFileUploadSurface(
  pathname: string,
  userId: string
): FileUploadSurface | null {
  if (pathname.includes('..')) return null;
  return (
    FILE_UPLOAD_SURFACES.find(surface =>
      pathname.startsWith(getFileBlobPathPrefix(surface, userId))
    ) ?? null
  );
}
