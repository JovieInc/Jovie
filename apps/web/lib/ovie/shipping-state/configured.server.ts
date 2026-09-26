import 'server-only';

import { env } from '@/lib/env-server';
import type { ShippingClock, ShippingStateProjection } from './contract';
import { systemClock } from './envelope';
import { createLiveShippingStateReaders, defaultLiveIo } from './live';
import { ageShippingStateProjection, unknownProjection } from './project';
import {
  getLastKnownShippingState,
  type PublishShippingStateInput,
  publishShippingState,
} from './publisher';

export const CONFIGURED_SHIPPING_STATE_MAX_AGE_MS = 6_000;

const configuredReaders = createLiveShippingStateReaders(
  defaultLiveIo({
    githubToken: env.HUD_GITHUB_TOKEN,
    githubOwner: env.HUD_GITHUB_OWNER,
    githubRepo: env.HUD_GITHUB_REPO,
    gemBridgeUrl: env.HUD_GEM_BRIDGE_URL,
    gemBridgeToken: env.HUD_GEM_BRIDGE_TOKEN,
  })
);

/**
 * Compose the installed authorities through the publisher's reader-keyed,
 * in-process coalescing. Do not mirror this high-cadence projection through
 * the shared production Redis quota; the durable Gem bridge keeps its own
 * bounded producer cadence and fixed receipt paths. Without HUD_GEM_BRIDGE_*
 * configuration the Gem-hosted sources honestly report not-configured.
 */
export function publishConfiguredShippingState(
  input: Pick<PublishShippingStateInput, 'clock'> = {}
): Promise<ShippingStateProjection> {
  const clock: ShippingClock | undefined = input.clock;
  return publishShippingState({
    readers: configuredReaders,
    ...(clock ? { clock } : {}),
    maxAgeMs: CONFIGURED_SHIPPING_STATE_MAX_AGE_MS,
  });
}

/**
 * Synchronous local-cache read for Ovie. The caller can start reconciliation
 * after taking this snapshot; UI latency never depends on Linear or another
 * remote provider. A cold process returns an honest syncing projection.
 */
export function readCachedConfiguredShippingState(
  clock: ShippingClock = systemClock()
): ShippingStateProjection {
  const cached = getLastKnownShippingState();
  if (cached) return ageShippingStateProjection(cached, clock.nowIso());
  const now = clock.nowIso();
  return unknownProjection({
    sequence: 0,
    observationTimestamp: now,
    emissionTimestamp: now,
    latencyMs: 0,
    publishing: true,
    lastError: null,
  });
}
