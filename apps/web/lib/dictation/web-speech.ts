import {
  createWebSpeechTranscriber,
  isWebSpeechTranscriptionSupported,
} from '@/lib/chat/transcriber';
import type { DictationProvider, SttEvent } from './types';

/** Keep native Web Speech result accumulation and graceful-stop behavior intact. */
export function createWebSpeechProvider(options?: {
  lang?: string;
  browserWindow?: Window;
}): DictationProvider {
  let session = 0;
  return {
    id: 'web-speech',
    capabilities: {
      streaming: true,
      partials: true,
      batch: false,
      languages: [options?.lang ?? 'en-US'],
      maxSessionSec: 60,
      fullDuplexSafe: false,
      runsIn: ['web'],
    },
    health: () => isWebSpeechTranscriptionSupported(options?.browserWindow),
    openStream(_mic, signal) {
      const segmentId = `web-speech-${++session}`;
      let lastTranscript = '';
      const listeners = new Set<(event: SttEvent) => void>();
      const emit = (event: SttEvent) => {
        for (const listener of listeners) listener(event);
      };
      const transcriber = createWebSpeechTranscriber(
        {
          onTranscript: text => {
            lastTranscript = text;
            emit({ type: 'partial', text });
          },
          onError: code => {
            if (lastTranscript && code === 'network')
              emit({ type: 'committed', segmentId, text: lastTranscript });
            emit({ type: 'error', code });
          },
          onEnd: () => emit({ type: 'closed' }),
        },
        options
      );
      signal.addEventListener('abort', () => transcriber.cancel(), {
        once: true,
      });
      return {
        subscribe(listener) {
          listeners.add(listener);
          transcriber.start();
          return () => listeners.delete(listener);
        },
        push() {},
        commit() {},
        close: () => transcriber.stop(),
        abort: () => transcriber.cancel(),
      };
    },
  };
}
