import 'server-only';

import { readFile } from 'node:fs/promises';
import ops from '../../../../ops/registry/capacity.json';
import spend from '../../../../ops/registry/spend.json';
import {
  type CapacityView,
  evaluateRegistry,
  type LiveOverlay,
  routingOrder,
} from '../../../../scripts/lib/capacity-registry.mjs';

export interface AdminCapacity {
  readonly view: CapacityView;
  readonly order: readonly { id: string; rank: number }[];
  readonly liveOverlay: 'applied' | 'none';
  readonly registryUpdatedAt: string;
}

/**
 * Optional live overlay (the lanes host's capacity-live.json). Without a delivery channel the
 * page shows the reviewed registry snapshot with staleness flags; a published overlay file
 * named by CAPACITY_LIVE_FILE is taken over the snapshot only where it is newer.
 */
async function readLiveOverlay(): Promise<LiveOverlay | null> {
  const path = process.env.CAPACITY_LIVE_FILE;
  if (!path) return null;
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as LiveOverlay)
      : null;
  } catch {
    return null;
  }
}

export async function getAdminCapacity(
  now = Date.now()
): Promise<AdminCapacity> {
  const live = await readLiveOverlay();
  const view = evaluateRegistry(ops, { now, live: live ?? {}, spend });
  return {
    view,
    order: routingOrder(view),
    liveOverlay: live ? 'applied' : 'none',
    registryUpdatedAt: ops.updatedAt,
  };
}
