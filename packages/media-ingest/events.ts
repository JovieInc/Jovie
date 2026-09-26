import type { AssetRecord, EventKind, MediaEvent } from './types';

const GEO_CLUSTER_KM = 1.5;
const EVENING_SHOW_MIN_ASSETS = 3;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function localDate(asset: AssetRecord): string {
  return (asset.capture.capturedAt ?? asset.ingestedAt).slice(0, 10);
}

function hourOf(asset: AssetRecord): number | null {
  const ts = asset.capture.capturedAt;
  if (!ts) return null;
  return new Date(ts).getUTCHours();
}

function centroid(assets: AssetRecord[]): {
  latitude: number | null;
  longitude: number | null;
} {
  const located = assets.filter(
    a => a.capture.latitude != null && a.capture.longitude != null
  );
  if (located.length === 0) return { latitude: null, longitude: null };
  const lat =
    located.reduce((sum, a) => sum + (a.capture.latitude ?? 0), 0) /
    located.length;
  const lon =
    located.reduce((sum, a) => sum + (a.capture.longitude ?? 0), 0) /
    located.length;
  return { latitude: lat, longitude: lon };
}

/** Greedy geo clustering: assets within GEO_CLUSTER_KM of an existing bucket
 *  join it; assets without coordinates join the day's first bucket. */
function geoCluster(dayAssets: AssetRecord[]): AssetRecord[][] {
  const clusters: {
    center: { lat: number; lon: number } | null;
    items: AssetRecord[];
  }[] = [];
  for (const asset of dayAssets) {
    const { latitude, longitude } = asset.capture;
    let target: (typeof clusters)[number] | undefined;
    if (latitude != null && longitude != null) {
      target = clusters.find(
        c =>
          c.center &&
          haversineKm(c.center.lat, c.center.lon, latitude, longitude) <=
            GEO_CLUSTER_KM
      );
      if (!target) {
        clusters.push({
          center: { lat: latitude, lon: longitude },
          items: [asset],
        });
        continue;
      }
    } else {
      target = clusters[0];
    }
    if (!target) {
      target = { center: null, items: [] };
      clusters.push(target);
    }
    target.items.push(asset);
  }
  return clusters.map(c => c.items);
}

function inferKind(
  cluster: AssetRecord[],
  distinctClustersOnDay: number
): { kind: EventKind; confidence: 'high' | 'low' } {
  const audioCount = cluster.filter(a => a.kind === 'audio').length;
  const eveningCount = cluster.filter(a => {
    const hour = hourOf(a);
    return hour != null && (hour >= 18 || hour <= 2);
  }).length;
  const hasLocation = cluster.some(a => a.capture.latitude != null);
  const hasVideo = cluster.some(a => a.kind === 'video');

  if (
    cluster.length >= EVENING_SHOW_MIN_ASSETS &&
    eveningCount >= Math.ceil(cluster.length / 2) &&
    hasLocation &&
    hasVideo
  ) {
    return { kind: 'show', confidence: 'high' };
  }
  if (distinctClustersOnDay > 1) {
    return { kind: 'travel-day', confidence: 'low' };
  }
  if (audioCount > 0 && audioCount >= cluster.length / 2) {
    return { kind: 'session', confidence: 'low' };
  }
  return { kind: 'unknown', confidence: 'low' };
}

/**
 * Group assets into day+location events. Low-confidence or ambiguous
 * groupings are returned as kind 'unknown' so callers ask the owner
 * instead of inventing an event.
 */
export function clusterEvents(assets: AssetRecord[]): MediaEvent[] {
  const byDay = new Map<string, AssetRecord[]>();
  for (const asset of assets) {
    const day = localDate(asset);
    const bucket = byDay.get(day) ?? [];
    bucket.push(asset);
    byDay.set(day, bucket);
  }

  const events: MediaEvent[] = [];
  for (const [date, dayAssets] of [...byDay.entries()].sort()) {
    const clusters = geoCluster(dayAssets);
    clusters.forEach((cluster, index) => {
      const { kind, confidence } = inferKind(cluster, clusters.length);
      const { latitude, longitude } = centroid(cluster);
      const seed = cluster[0]?.checksum.sha256.slice(0, 8) ?? 'x';
      events.push({
        id: `${date}-${index + 1}-${seed}`,
        date,
        kind,
        latitude,
        longitude,
        assetIds: cluster.map(a => a.id),
        confidence,
      });
    });
  }
  return events;
}
