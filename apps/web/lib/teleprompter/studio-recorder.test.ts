import { describe, expect, it } from 'vitest';
import {
  cameraErrorCopy,
  classifyCameraError,
  formatTakeDuration,
  pickTakeMimeType,
} from './studio-recorder';

describe('studio recorder helpers', () => {
  it('prefers webm and falls back to mp4 for Safari', () => {
    expect(
      pickTakeMimeType(type => type.startsWith('video/webm;codecs=vp9'))
    ).toBe('video/webm;codecs=vp9,opus');
    expect(pickTakeMimeType(type => type === 'video/mp4')).toBe('video/mp4');
    expect(pickTakeMimeType(undefined)).toBe('video/webm');
    expect(
      pickTakeMimeType(() => {
        throw new Error('bad codec');
      })
    ).toBe('video/webm');
  });

  it('names why the camera did not start', () => {
    expect(classifyCameraError(new DOMException('x', 'NotAllowedError'))).toBe(
      'denied'
    );
    expect(classifyCameraError(new DOMException('x', 'NotFoundError'))).toBe(
      'no-device'
    );
    expect(classifyCameraError(new DOMException('x', 'NotReadableError'))).toBe(
      'in-use'
    );
    expect(classifyCameraError(new TypeError('x'))).toBe('unsupported');
    expect(classifyCameraError('weird')).toBe('unknown');
    expect(cameraErrorCopy('denied').title).toMatch(/camera and mic/);
  });

  it('formats take length as m:ss', () => {
    expect(formatTakeDuration(42_400)).toBe('0:42');
    expect(formatTakeDuration(125_000)).toBe('2:05');
    expect(formatTakeDuration(-1)).toBe('0:00');
  });
});
