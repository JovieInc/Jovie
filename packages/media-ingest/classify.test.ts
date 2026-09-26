import { describe, expect, it } from 'vitest';
import { classifyOrigin } from './classify';
import type { CaptureInfo } from './types';

const capture = (over: Partial<CaptureInfo> = {}): CaptureInfo => ({
  capturedAt: '2026-09-20T21:00:00.000Z',
  latitude: null,
  longitude: null,
  cameraModel: null,
  source: 'exif',
  ...over,
});

describe('classifyOrigin', () => {
  it('marks fan inbox sources as fan', () => {
    const result = classifyOrigin({
      sourcePath: '/fan-inbox/pic.jpg',
      capture: capture({ cameraModel: 'iPhone 15 Pro' }),
      subtype: 'photo',
      fanDirs: ['/fan-inbox'],
      ownerDevices: ['iphone'],
    });
    expect(result.origin).toBe('fan');
  });

  it('marks owner-device captures as yours', () => {
    const result = classifyOrigin({
      sourcePath: '/photos/img.jpg',
      capture: capture({ cameraModel: 'iPhone 15 Pro' }),
      subtype: 'photo',
      fanDirs: [],
      ownerDevices: ['iphone'],
    });
    expect(result.origin).toBe('yours');
  });

  it('asks when provenance is absent or unrecognized', () => {
    const noExif = classifyOrigin({
      sourcePath: '/photos/img.jpg',
      capture: capture({ source: 'mtime' }),
      subtype: 'photo',
      fanDirs: [],
      ownerDevices: ['iphone'],
    });
    expect(noExif.origin).toBe('unknown');

    const oddCamera = classifyOrigin({
      sourcePath: '/photos/img.jpg',
      capture: capture({ cameraModel: 'Canon EOS R5' }),
      subtype: 'photo',
      fanDirs: [],
      ownerDevices: ['iphone'],
    });
    expect(oddCamera.origin).toBe('unknown');
    expect(oddCamera.reason).toContain('Canon');
  });
});
