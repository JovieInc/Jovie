import { describe, expect, it } from 'vitest';
import {
  buildSweepManifest,
  inferSurfaceFromText,
  surfacePriority,
} from '../../scripts/overnight-qa/manifest';

describe('overnight-qa manifest', () => {
  it('builds the expected suite order and base URL wiring', () => {
    const suites = buildSweepManifest('http://127.0.0.1:4310');

    expect(suites.map(suite => suite.id)).toEqual([
      'breadth-route-qa',
      'smoke-public',
      'smoke-auth',
      'golden-path',
      'content-gate',
      'dashboard-health',
      'chaos-authenticated',
      'releases-chaos',
      'full-surface-chaos',
      'auth-flows-nightly',
      'onboarding-nightly',
    ]);
    expect(suites[0]?.env).toMatchObject({
      ROUTE_QA_BASE_URL: 'http://127.0.0.1:4310',
    });
    expect(suites[8]?.env).toMatchObject({
      BASE_URL: 'http://127.0.0.1:4310',
    });
  });

  it('prioritizes higher-risk surfaces first', () => {
    expect(surfacePriority('billing')).toBeLessThan(surfacePriority('admin'));
    expect(surfacePriority('admin')).toBeLessThan(surfacePriority('marketing'));
  });

  it('infers surfaces from common failure text', () => {
    expect(
      inferSurfaceFromText('Billing page failed with /api/stripe 500')
    ).toBe('billing');
    expect(inferSurfaceFromText('Admin route redirected unexpectedly')).toBe(
      'admin'
    );
    expect(inferSurfaceFromText('SignIn loop detected')).toBe('auth');
    expect(inferSurfaceFromText('Unknown failure', 'alias')).toBe('alias');
  });
});
