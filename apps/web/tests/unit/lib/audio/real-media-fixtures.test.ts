import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AUDIO_FORMAT_IDS,
  AUDIO_FORMAT_REGISTRY,
} from '@jovie/audio-contracts';
import { describe, expect, it } from 'vitest';
import {
  MALFORMED_AUDIO_FIXTURES,
  REAL_AUDIO_FIXTURES,
} from '../../../fixtures/audio/manifest';

function readFixture(fileName: string): Buffer {
  return readFileSync(resolve(process.cwd(), 'tests/fixtures/audio', fileName));
}

describe('real audio media fixtures', () => {
  it('covers every canonical format exactly once', () => {
    expect(REAL_AUDIO_FIXTURES.map(fixture => fixture.formatId)).toEqual(
      AUDIO_FORMAT_IDS
    );
    expect(
      new Set(REAL_AUDIO_FIXTURES.map(fixture => fixture.formatId)).size
    ).toBe(AUDIO_FORMAT_IDS.length);
  });

  it.each(
    REAL_AUDIO_FIXTURES
  )('pins the generated $formatId bytes and canonical MIME', fixture => {
    const bytes = readFixture(fixture.fileName);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const registryFormat = AUDIO_FORMAT_REGISTRY.find(
      format => format.id === fixture.formatId
    );

    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(digest).toBe(fixture.sha256);
    expect(registryFormat?.canonicalMimeType).toBe(fixture.mimeType);
  });

  it('records AIFF as accepted but not directly Chromium-decodable', () => {
    const aiff = REAL_AUDIO_FIXTURES.find(
      fixture => fixture.formatId === 'aiff'
    );
    expect(aiff).toMatchObject({
      expectedChromiumCanPlayType: '',
      expectedChromiumDecode: 'unsupported',
    });
  });

  it('covers every canonical format with a pinned truncated container', () => {
    expect(MALFORMED_AUDIO_FIXTURES.map(fixture => fixture.formatId)).toEqual(
      AUDIO_FORMAT_IDS
    );
  });

  it.each(
    MALFORMED_AUDIO_FIXTURES
  )('pins the malformed $formatId bytes without treating them as empty', fixture => {
    const bytes = readFixture(fixture.fileName);
    const digest = createHash('sha256').update(bytes).digest('hex');

    expect(bytes.byteLength).toBe(32);
    expect(digest).toBe(fixture.sha256);
  });
});
