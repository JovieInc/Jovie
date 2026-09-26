export type ReleasePopoverType = 'Single' | 'EP' | 'Album';
export type ReleasePopoverSpotify = 'live' | 'pending' | 'error' | 'missing';

export function releaseTrackCount(type: ReleasePopoverType): number {
  if (type === 'Single') return 1;
  if (type === 'EP') return 5;
  return 11;
}

export function releasePopoverStatus(
  spotify: ReleasePopoverSpotify,
  pitchReady: boolean
): 'Live' | 'Ready' | 'Draft' {
  if (spotify === 'live') return 'Live';
  if (pitchReady) return 'Ready';
  return 'Draft';
}
