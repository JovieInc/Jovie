import type { CaptureInfo, MediaSubtype, Origin } from './types';

export interface ClassifyInput {
  sourcePath: string;
  capture: CaptureInfo;
  subtype: MediaSubtype;
  fanDirs: string[];
  ownerDevices: string[];
}

export interface Classification {
  origin: Origin;
  reason: string;
}

/**
 * Yours-vs-fan classification. Fan content stays a presence/claim object —
 * it must not enter the retouch pipeline. Anything ambiguous resolves to
 * 'unknown' so the owner is asked rather than guessed.
 */
export function classifyOrigin(input: ClassifyInput): Classification {
  const normalized = input.sourcePath.replaceAll('\\', '/');
  const inFanDir = input.fanDirs.some(dir => {
    const prefix = `${dir.replaceAll('\\', '/').replace(/\/$/, '')}/`;
    return normalized.startsWith(prefix);
  });
  if (inFanDir) return { origin: 'fan', reason: 'source is a fan inbox dir' };

  const rawModel = input.capture.cameraModel ?? '';
  const model = rawModel.toLowerCase();
  if (
    model &&
    input.ownerDevices.some(device => model.includes(device.toLowerCase()))
  ) {
    return {
      origin: 'yours',
      reason: `camera matches owner device: ${rawModel}`,
    };
  }

  if (input.subtype === 'screenshot') {
    return { origin: 'unknown', reason: 'screenshot has no camera provenance' };
  }

  if (input.capture.source === 'exif' && model) {
    return {
      origin: 'unknown',
      reason: `unrecognized camera: ${rawModel} — ask owner`,
    };
  }

  return { origin: 'unknown', reason: 'no provenance signal — ask owner' };
}
