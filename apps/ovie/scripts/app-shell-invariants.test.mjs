import { describe, expect, it } from 'vitest';
import {
  auditOvieAppShell,
  findRepeatedStatusCounts,
} from './app-shell-invariants.mjs';

describe('Ovie app-shell certification', () => {
  it('audits every Ovie UI route against the canonical shell contracts', async () => {
    const result = await auditOvieAppShell();

    expect(result.violations).toEqual([]);
    expect(result.routes.length).toBeGreaterThanOrEqual(42);
    expect(result.routes).toContainEqual(
      expect.objectContaining({ route: '/hud/wiki', owner: 'shell-adapter' })
    );
    expect(result.routes).toContainEqual(
      expect.objectContaining({
        route: '/hud',
        owner: 'operator-shell-or-token-kiosk',
      })
    );
  });

  it('rejects duplicate rendered status/count data', () => {
    expect(findRepeatedStatusCounts('1 of 20 · active · 1 of 20')).toEqual([
      '1 of 20',
    ]);
    expect(findRepeatedStatusCounts('1 of 20 · 2 pending')).toEqual([]);
  });
});
