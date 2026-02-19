const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const JPEG_MIME_TYPE = 'image/jpeg';

function toJpegFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') + '.jpg';
}

export function isHeicLikeMimeType(mimeType: string): boolean {
  return HEIC_MIME_TYPES.has(mimeType.toLowerCase());
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicLikeMimeType(file.type)) {
    return file;
  }

  const heic2anyModule = await import('heic2any');
  const result = await heic2anyModule.default({
    blob: file,
    toType: JPEG_MIME_TYPE,
    quality: 0.9,
  });

  const blob = Array.isArray(result) ? result[0] : result;
  if (!(blob instanceof Blob)) {
    throw new Error(
      'Failed to convert HEIC image. Please try a different file.'
    );
  }

  return new File([blob], toJpegFilename(file.name), {
    type: JPEG_MIME_TYPE,
    lastModified: file.lastModified,
  });
}
