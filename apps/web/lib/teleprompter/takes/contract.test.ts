import { describe, expect, it } from 'vitest';
import {
  isOwnedTakeVideoPath,
  SaveTeleprompterTakeSchema,
  teleprompterTakeBlobPrefix,
  teleprompterTakeMetadataPath,
  teleprompterTakeVideoPath,
  toTeleprompterTakeSummary,
} from './contract';

const TAKE_ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';

describe('teleprompter take paths', () => {
  it('keeps every take under the owner prefix', () => {
    expect(teleprompterTakeBlobPrefix('user_abc')).toBe(
      'jovie/teleprompter/takes/user_abc/'
    );
    expect(teleprompterTakeVideoPath('user_abc', TAKE_ID, 'video/webm')).toBe(
      `jovie/teleprompter/takes/user_abc/${TAKE_ID}.webm`
    );
    expect(teleprompterTakeMetadataPath('user_abc', TAKE_ID)).toBe(
      `jovie/teleprompter/takes/user_abc/${TAKE_ID}.json`
    );
  });

  it('rejects owners and ids that could escape the prefix', () => {
    expect(() => teleprompterTakeBlobPrefix('../other')).toThrow();
    expect(() => teleprompterTakeBlobPrefix('')).toThrow();
    expect(() =>
      teleprompterTakeVideoPath('user_abc', 'not-a-uuid', 'video/mp4')
    ).toThrow();
  });

  it('signs uploads only for the owner video path', () => {
    const own = `jovie/teleprompter/takes/user_abc/${TAKE_ID}.webm`;
    expect(isOwnedTakeVideoPath('user_abc', own)).toBe(true);
    expect(isOwnedTakeVideoPath('user_abc', own.replace('.webm', '.mp4'))).toBe(
      true
    );
    expect(isOwnedTakeVideoPath('user_xyz', own)).toBe(false);
    expect(
      isOwnedTakeVideoPath('user_abc', own.replace('.webm', '.json'))
    ).toBe(false);
    expect(
      isOwnedTakeVideoPath(
        'user_abc',
        `jovie/teleprompter/takes/user_abc/x/${TAKE_ID}.webm`
      )
    ).toBe(false);
    expect(isOwnedTakeVideoPath('../x', own)).toBe(false);
  });
});

describe('SaveTeleprompterTakeSchema', () => {
  const valid = {
    takeId: TAKE_ID,
    contentType: 'video/webm',
    byteSize: 1024,
    durationMs: 42_000,
    takeNumber: 1,
    title: 'Release day shout-out',
    kind: 'promo',
    source: 'script',
    script: 'Tonight I am playing it live.',
  };

  it('accepts a take from the studio', () => {
    expect(SaveTeleprompterTakeSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects client-chosen paths and unknown keys', () => {
    expect(
      SaveTeleprompterTakeSchema.safeParse({
        ...valid,
        videoPathname: 'elsewhere',
      }).success
    ).toBe(false);
    expect(
      SaveTeleprompterTakeSchema.safeParse({
        ...valid,
        contentType: 'text/html',
      }).success
    ).toBe(false);
  });
});

describe('toTeleprompterTakeSummary', () => {
  it('never exposes the storage path', () => {
    const summary = toTeleprompterTakeSummary({
      schemaVersion: 1,
      takeId: TAKE_ID,
      videoPathname: `jovie/teleprompter/takes/user_abc/${TAKE_ID}.webm`,
      contentType: 'video/webm',
      byteSize: 10,
      durationMs: 1000,
      takeNumber: 2,
      title: 'T',
      kind: 'bts',
      source: 'answer',
      question: 'Why?',
      kept: true,
      createdAt: '2026-11-07T22:00:00.000Z',
      updatedAt: '2026-11-07T22:00:00.000Z',
    });
    expect(summary).not.toHaveProperty('videoPathname');
    expect(summary.mediaUrl).toBe(`/api/teleprompter/takes/${TAKE_ID}/media`);
    expect(summary.question).toBe('Why?');
  });
});
