import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderSwiftTranscriptionContract } from './generate-audio-transcription-swift';

const generatedSwiftPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../ios/Jovie/Core/AudioTranscriptionContract.generated.swift'
);

describe('Swift audio transcription contract', () => {
  it('matches the canonical TypeScript registries byte-for-byte', () => {
    expect(readFileSync(generatedSwiftPath, 'utf8')).toBe(
      renderSwiftTranscriptionContract()
    );
  });
});
