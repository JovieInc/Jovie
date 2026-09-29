import { ovieAdminReadRoute } from '@/lib/ovie/admin-read';
import { readOvieCertificationInventory } from '@/lib/ovie/certifications/inventory.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One read over every certification domain the kernel knows. Each domain
 * reports connected / empty / not_connected / error, so an unconnected
 * domain is never presented as a certified zero (`universal: false`).
 */
export const GET = ovieAdminReadRoute(
  'certification_inventory_unavailable',
  readOvieCertificationInventory
);
