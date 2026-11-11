/**
 * Jovie's spoken questions between takes.
 *
 * Tim's rule (2026-11-07): text always, voice too, but smartly handle the
 * no-headphones case so her voice never plays into the mic. Two guards:
 * 1. Voice only plays while the camera is stopped, so it can never land in a
 *    take even if detection is wrong.
 * 2. Voice is on only when the active audio output reads as headphones.
 *    Built-in speakers, or an output the browser won't name (Safari, or no
 *    mic permission yet), keep her muted until the creator turns her on.
 */

export type VoiceOutputKind = 'headphones' | 'speakers' | 'unknown';

export interface AudioOutputLike {
  readonly kind: string;
  readonly deviceId: string;
  readonly label: string;
}

const HEADPHONE_LABEL =
  /head(phone|set)|ear(phone|bud|pod)|airpods|buds|shokz|\bw[hf]-\d/i;
const SPEAKER_LABEL =
  /built[- ]?in|internal|macbook|imac|laptop|speakers?\b|realtek|display audio|hdmi|displayport|monitor/i;

/**
 * Classifies the output the browser will play through. Chrome lists the
 * system default as deviceId `default` with a label like
 * "Default - MacBook Pro Speakers (Built-in)". Anything that says speaker is
 * speakers. Audio interfaces and generic Bluetooth or USB outputs stay
 * unknown (muted), because they often drive studio monitors that the mic
 * would pick up.
 */
export function classifyVoiceOutput(
  devices: readonly AudioOutputLike[]
): VoiceOutputKind {
  const outputs = devices.filter(device => device.kind === 'audiooutput');
  if (outputs.length === 0) return 'unknown';
  const active =
    outputs.find(device => device.deviceId === 'default') ?? outputs[0];
  const label = active?.label.trim() ?? '';
  if (!label) return 'unknown';
  if (/speaker/i.test(label) && !/head|ear|buds|pods/i.test(label)) {
    return 'speakers';
  }
  if (HEADPHONE_LABEL.test(label)) return 'headphones';
  if (SPEAKER_LABEL.test(label)) return 'speakers';
  return 'unknown';
}

export async function detectVoiceOutput(
  mediaDevices: Pick<MediaDevices, 'enumerateDevices'> | undefined = globalThis
    .navigator?.mediaDevices
): Promise<VoiceOutputKind> {
  if (!mediaDevices?.enumerateDevices) return 'unknown';
  try {
    return classifyVoiceOutput(await mediaDevices.enumerateDevices());
  } catch {
    return 'unknown';
  }
}

export function voiceStartsOn(kind: VoiceOutputKind): boolean {
  return kind === 'headphones';
}

export function voiceStatusCopy(params: {
  readonly kind: VoiceOutputKind;
  readonly enabled: boolean;
  readonly supported: boolean;
}): string {
  if (!params.supported) return "This browser can't read questions aloud.";
  if (params.enabled) return 'Jovie reads each question aloud.';
  if (params.kind === 'speakers') {
    return 'Voice off on laptop speakers. Plug in headphones to hear her.';
  }
  return 'Voice off. Turn it on if you have headphones in.';
}

export interface QuestionSpeaker {
  readonly supported: boolean;
  speak(text: string): void;
  cancel(): void;
}

export function createQuestionSpeaker(
  synth: SpeechSynthesis | undefined = globalThis.window?.speechSynthesis
): QuestionSpeaker {
  const Utterance = globalThis.window?.SpeechSynthesisUtterance;
  const supported = Boolean(synth && Utterance);
  return {
    supported,
    speak(text) {
      if (!supported || !synth || !Utterance) return;
      synth.cancel();
      const utterance = new Utterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      synth.speak(utterance);
    },
    cancel() {
      synth?.cancel();
    },
  };
}
