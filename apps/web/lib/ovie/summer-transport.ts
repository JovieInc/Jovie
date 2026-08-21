/**
 * Ovie door → Summer transport (JOV-5214).
 *
 * OV chat must not generate as artist Jovie and must not self-identify as
 * Ovie. Conversational authority is the real current Summer (JOV-5212).
 * The web route resolves this marker through the authenticated Mac bridge.
 */

import type { OvieReceipt } from '@/lib/ovie/ingest';
import {
  assertModelMustNotSelfIdentifyAsOvie,
  assertOvieDoorDoesNotUseArtistJovieGeneration,
  type OvieDoorGenerationKind,
} from '@/lib/ovie/program';

export type OvieDoorGeneration =
  | { readonly kind: 'artist-jovie' }
  | {
      readonly kind: 'summer-transport';
      readonly state: 'queued';
    };

export function buildSummerUnavailableTransportText(
  receipts: readonly OvieReceipt[]
): string {
  const ackLines = receipts.map(receipt => receipt.ack).filter(Boolean);
  const intake =
    ackLines.length > 0
      ? `Eve intake/ack: ${ackLines.join('; ')}.`
      : 'Eve intake/ack completed with no dump items.';
  const text = [
    intake,
    'Conversation with the current Summer is unavailable on this door until JOV-5212 binds the live Mac Summer runtime.',
    'Ovie is the door, not the speaker. State: unavailable.',
  ].join(' ');
  assertModelMustNotSelfIdentifyAsOvie(text);
  return text;
}

export function resolveOvieDoorGeneration(
  chatMode: 'ov' | null | undefined,
  receipts: readonly OvieReceipt[] = []
): OvieDoorGeneration {
  if (chatMode !== 'ov') {
    const generation: OvieDoorGeneration = { kind: 'artist-jovie' };
    assertOvieDoorDoesNotUseArtistJovieGeneration(chatMode, generation.kind);
    return generation;
  }
  const generation: OvieDoorGeneration = {
    kind: 'summer-transport',
    state: 'queued',
  };
  assertOvieDoorDoesNotUseArtistJovieGeneration(chatMode, generation.kind);
  return generation;
}

export function ovieDoorGenerationKind(
  generation: OvieDoorGeneration
): OvieDoorGenerationKind {
  return generation.kind;
}
