import { describe, expect, it } from 'vitest';
import {
  type Transcriber,
  transcribeMedia,
  WhisperCliTranscriber,
} from './transcribe';

describe('transcribeMedia', () => {
  it('flags foreign-language speech for a translation track', async () => {
    const transcriber: Transcriber = {
      name: 'fake',
      available: async () => true,
      transcribe: async () => ({ text: 'hola', language: 'es' }),
    };
    const result = await transcribeMedia('/x.wav', transcriber, 'en');
    expect(result?.needsTranslation).toBe(true);
    expect(result?.language).toBe('es');
  });

  it('does not flag primary-language speech', async () => {
    const transcriber: Transcriber = {
      name: 'fake',
      available: async () => true,
      transcribe: async () => ({ text: 'hello', language: 'en' }),
    };
    const result = await transcribeMedia('/x.wav', transcriber, 'en');
    expect(result?.needsTranslation).toBe(false);
  });

  it('returns null when no engine is installed', async () => {
    const transcriber: Transcriber = {
      name: 'none',
      available: async () => false,
      transcribe: async () => ({ text: '', language: '' }),
    };
    expect(await transcribeMedia('/x.wav', transcriber, 'en')).toBeNull();
  });

  it('whisper adapter reports availability honestly', async () => {
    const missing = new WhisperCliTranscriber(
      'definitely-not-installed-whisper'
    );
    expect(await missing.available()).toBe(false);
  });
});
