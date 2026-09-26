import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TranscriptResult } from './types';

const execFileAsync = promisify(execFile);

export interface Transcriber {
  readonly name: string;
  available(): Promise<boolean>;
  transcribe(filePath: string): Promise<{ text: string; language: string }>;
}

/**
 * Local Whisper CLI adapter (OpenAI whisper / whisper.cpp `whisper-cli`
 * style `--output-json`). Used only when the binary is already installed —
 * ingest never downloads a model on its own.
 */
export class WhisperCliTranscriber implements Transcriber {
  readonly name = 'whisper-cli';

  constructor(private readonly binary = 'whisper') {}

  async available(): Promise<boolean> {
    try {
      await execFileAsync('which', [this.binary]);
      return true;
    } catch {
      return false;
    }
  }

  async transcribe(
    filePath: string
  ): Promise<{ text: string; language: string }> {
    const { stdout } = await execFileAsync(this.binary, [
      filePath,
      '--output_format',
      'json',
    ]);
    const parsed = JSON.parse(stdout) as { text?: string; language?: string };
    return {
      text: parsed.text ?? '',
      language: parsed.language ?? 'unknown',
    };
  }
}

/**
 * Produce a transcript + CC record for a media file. Foreign-language
 * speech gets a translation track flag. When no engine is installed the
 * caller gets null and should mark the asset for owner review — ingest
 * never fabricates captions.
 */
export async function transcribeMedia(
  filePath: string,
  transcriber: Transcriber,
  primaryLanguage: string
): Promise<TranscriptResult | null> {
  if (!(await transcriber.available())) return null;
  const { text, language } = await transcriber.transcribe(filePath);
  if (!text) return null;
  return {
    text,
    language,
    needsTranslation:
      language !== 'unknown' &&
      language.toLowerCase() !== primaryLanguage.toLowerCase(),
    engine: transcriber.name,
  };
}
