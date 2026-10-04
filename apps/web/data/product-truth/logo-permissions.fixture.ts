import { LOGO_ASSET_REGISTRY } from '@/data/design/logoAssets';
import type { LogoPermission } from './logo-permissions';

/**
 * Example grants for stories and tests only. They are not real permissions;
 * the logo-permission gate fails if production code imports this module.
 */
export const LOGO_PERMISSION_FIXTURES: readonly LogoPermission[] =
  LOGO_ASSET_REGISTRY.map(asset => ({
    id: `fixture-${asset.id}`,
    brand: asset.id,
    assetId: asset.id,
    relationship: 'customer',
    grantedBy: 'Example Grantor, Example Co.',
    grantedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    evidenceUrl: 'https://example.com/logo-permission-fixture',
    scope: { pages: ['*'] },
  }));
