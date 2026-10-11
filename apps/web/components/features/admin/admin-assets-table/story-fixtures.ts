import type { AdminAssetRow } from '@/lib/admin/types';

export const assets = [
  {
    id: 'asset-story-1',
    assetType: 'release',
    title: 'Signal Bloom',
    subtitle: 'Album · 2026',
    href: null,
    thumbnailUrl: null,
    status: 'active',
    sourceType: 'ingested',
    isExplicit: false,
    issues: ['No artwork', 'No UPC'],
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    ownerUsername: 'signalbloom',
    ownerDisplayName: 'Signal Bloom',
    ownerAvatarUrl: null,
    ownerUserId: 'user-story-1',
    ownerIsVerified: true,
  },
] satisfies AdminAssetRow[];
