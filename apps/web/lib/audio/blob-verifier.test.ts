import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MALFORMED_AUDIO_FIXTURES,
  REAL_AUDIO_FIXTURES,
} from '@/tests/fixtures/audio/manifest';
import { sniffAudioBytes } from './blob-verifier';

describe('audio blob byte verifier', () => {
  it.each(
    REAL_AUDIO_FIXTURES
  )('accepts the real $formatId fixture', async fixture => {
    const bytes = new Uint8Array(
      await readFile(
        join(process.cwd(), 'tests/fixtures/audio', fixture.fileName)
      )
    );
    expect(sniffAudioBytes(bytes, bytes.length)).toBe(fixture.formatId);
  });

  it.each(
    MALFORMED_AUDIO_FIXTURES
  )('rejects the malformed $formatId fixture', async fixture => {
    const bytes = new Uint8Array(
      await readFile(
        join(process.cwd(), 'tests/fixtures/audio', fixture.fileName)
      )
    );
    expect(sniffAudioBytes(bytes, bytes.length)).toBeNull();
  });
});
