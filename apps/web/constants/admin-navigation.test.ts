import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV_REGISTRY,
  ADMIN_SETTINGS_TOOL_IDS,
} from './admin-navigation';
import { APP_ROUTES } from './routes';

describe('founder certification navigation', () => {
  it('offers one certification workspace without flag or registry review tools', () => {
    expect(
      ADMIN_NAV_REGISTRY.find(item => item.id === 'certifications')?.href
    ).toBe(APP_ROUTES.ADMIN_CERTIFICATIONS);
    for (const id of ['feature_registry', 'features']) {
      expect(ADMIN_SETTINGS_TOOL_IDS).not.toContain(id);
      expect(ADMIN_NAV_REGISTRY.some(item => item.id === id)).toBe(false);
    }
  });
});
