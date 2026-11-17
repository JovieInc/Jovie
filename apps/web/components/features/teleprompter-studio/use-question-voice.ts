'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createQuestionSpeaker,
  detectVoiceOutput,
  type VoiceOutputKind,
  voiceStartsOn,
  voiceStatusCopy,
} from '@/lib/teleprompter/studio-voice';

/**
 * Jovie reading the question aloud. Her voice plays only between takes (the
 * recorder is stopped, so nothing bleeds into a take) and starts on only when
 * the output looks like headphones.
 */
export function useQuestionVoice({
  question,
  between,
}: {
  readonly question: string;
  readonly between: boolean;
}) {
  const speaker = useMemo(() => createQuestionSpeaker(), []);
  const [output, setOutput] = useState<VoiceOutputKind>('unknown');
  const [enabled, setEnabled] = useState(false);

  /** Output labels are readable once mic permission is granted. */
  const detect = useCallback(async () => {
    const kind = await detectVoiceOutput();
    setOutput(kind);
    setEnabled(speaker.supported && voiceStartsOn(kind));
  }, [speaker.supported]);

  useEffect(() => {
    const onDeviceChange = () => {
      void detectVoiceOutput().then(kind => {
        setOutput(kind);
        // A switch to speakers mutes her; a switch to headphones never
        // unmutes without the creator asking.
        if (!voiceStartsOn(kind)) setEnabled(false);
      });
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.(
        'devicechange',
        onDeviceChange
      );
      speaker.cancel();
    };
  }, [speaker]);

  useEffect(() => {
    if (between && enabled && question) speaker.speak(question);
    else speaker.cancel();
  }, [between, enabled, question, speaker]);

  return {
    supported: speaker.supported,
    enabled,
    setEnabled,
    detect,
    cancel: speaker.cancel,
    status: voiceStatusCopy({
      kind: output,
      enabled,
      supported: speaker.supported,
    }),
  };
}
