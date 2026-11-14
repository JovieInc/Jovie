'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  createWebSpeechTranscriber,
  type Transcriber,
} from '@/lib/chat/transcriber';
import type { ScriptFollower } from '@/lib/teleprompter/script-follower';

interface UseScriptVoiceFollowOptions {
  readonly follower: ScriptFollower;
  /** True while a take is recording; Web Speech is restarted until then. */
  readonly isRecording: () => boolean;
  readonly onWordIndex: (index: number) => void;
  /** The browser refused speech recognition; fall back to speed scroll. */
  readonly onUnavailable: () => void;
}

/** Moves the script along with what the creator says during a take. */
export function useScriptVoiceFollow({
  follower,
  isRecording,
  onWordIndex,
  onUnavailable,
}: UseScriptVoiceFollowOptions) {
  const transcriberRef = useRef<Transcriber | null>(null);

  const stop = useCallback(() => {
    const transcriber = transcriberRef.current;
    transcriberRef.current = null;
    transcriber?.cancel();
    transcriber?.dispose();
  }, []);

  const start = useCallback(() => {
    follower.resetTranscriptAnchor();
    const transcriber = createWebSpeechTranscriber({
      onTranscript: text => {
        follower.ingest(text);
        onWordIndex(follower.nextWordIndex);
      },
      onError: code => {
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          onUnavailable();
        }
      },
      onEnd: () => {
        // Web Speech ends on silence. Keep following for the whole take.
        if (isRecording() && transcriberRef.current === transcriber) {
          follower.resetTranscriptAnchor();
          transcriber.start();
        }
      },
    });
    transcriberRef.current?.dispose();
    transcriberRef.current = transcriber;
    transcriber.start();
  }, [follower, isRecording, onUnavailable, onWordIndex]);

  useEffect(() => () => transcriberRef.current?.dispose(), []);

  return { start, stop };
}
