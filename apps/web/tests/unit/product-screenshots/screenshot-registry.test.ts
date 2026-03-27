import { describe, expect, it } from 'vitest';
import { SCREENSHOT_SCENARIOS } from '../../../lib/screenshots/registry';

describe('screenshot registry', () => {
  it('uses unique scenario ids', () => {
    const ids = SCREENSHOT_SCENARIOS.map(scenario => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses unique public export paths', () => {
    const exportPaths = SCREENSHOT_SCENARIOS.flatMap(scenario =>
      scenario.publicExportPath ? [scenario.publicExportPath] : []
    );
    expect(new Set(exportPaths).size).toBe(exportPaths.length);
  });

  it('points every scenario at a valid app route', () => {
    for (const scenario of SCREENSHOT_SCENARIOS) {
      expect(scenario.route.startsWith('/')).toBe(true);
      expect(scenario.waitFor.length).toBeGreaterThan(0);
      expect(scenario.consumers).toContain('admin');
    }
  });
});
