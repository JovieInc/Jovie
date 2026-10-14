import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { APP_SCREEN_REGISTRY } from '@/data/appScreens';
import {
  getProductProjection,
  PRODUCT_ONTOLOGY,
  PRODUCT_ONTOLOGY_FIXTURES,
  PRODUCT_REPRESENTATIONS,
  TOP_LEVEL_PRODUCT_CONCEPTS,
  WORK_AMBIGUITY_GUARDRAILS,
} from '@/data/productOntology';

describe('Identity and Work product ontology', () => {
  it('projects only enabled features while retaining technical compatibility IDs', () => {
    expect(
      getProductProjection({}).features.map(feature => feature.featureId)
    ).toEqual(['work']);
    const enabled = getProductProjection({ PROFILES_WORKSPACE: true });
    expect(enabled.features).toContainEqual({
      featureId: 'identity',
      label: 'Identity',
      destination: APP_ROUTES.PRESENCE,
    });
    expect(enabled.features).toContainEqual({
      featureId: 'work',
      label: 'Work',
      destination: APP_ROUTES.LIBRARY,
    });
    expect(() => getProductProjection({}, 'fr')).toThrow('not defined');
  });
  it('has exactly two top-level concepts and treats links as representation', () => {
    expect(TOP_LEVEL_PRODUCT_CONCEPTS).toEqual(['identity', 'work']);
    expect(Object.keys(PRODUCT_ONTOLOGY)).toEqual(['identity', 'work']);
    expect(PRODUCT_REPRESENTATIONS.links.targets).toEqual(['identity', 'work']);
    expect(TOP_LEVEL_PRODUCT_CONCEPTS).not.toContain('links');
  });

  it('preserves canonical and compatibility routes', () => {
    expect(PRODUCT_ONTOLOGY.identity.canonicalRoute).toBe(APP_ROUTES.PRESENCE);
    expect(PRODUCT_ONTOLOGY.identity.compatibilityRoutes).toContain(
      APP_ROUTES.DASHBOARD_LINKS
    );
    expect(PRODUCT_ONTOLOGY.work.canonicalRoute).toBe(APP_ROUTES.LIBRARY);
    expect(PRODUCT_ONTOLOGY.work.compatibilityRoutes).toEqual(
      expect.arrayContaining([
        APP_ROUTES.LEGACY_DASHBOARD_LIBRARY,
        APP_ROUTES.RELEASES,
        APP_ROUTES.DASHBOARD_RELEASES,
      ])
    );
  });

  it('holds across every required audience without task semantics', () => {
    expect(PRODUCT_ONTOLOGY_FIXTURES.map(fixture => fixture.icp)).toEqual([
      'musician',
      'founder',
      'author',
      'creator',
      'expert',
    ]);

    for (const fixture of PRODUCT_ONTOLOGY_FIXTURES) {
      expect(fixture.identity.length).toBeGreaterThan(0);
      expect(fixture.work.length).toBeGreaterThan(0);
      expect(fixture.work).not.toEqual(
        expect.arrayContaining([...WORK_AMBIGUITY_GUARDRAILS.excludedMeanings])
      );
    }
  });

  it('keeps one certified design reference for each canonical concept route', () => {
    for (const route of [
      PRODUCT_ONTOLOGY.identity.canonicalRoute,
      PRODUCT_ONTOLOGY.work.canonicalRoute,
    ]) {
      const references = APP_SCREEN_REGISTRY.filter(
        screen => screen.designReference && screen.conceptId === route
      );
      expect(references.map(screen => screen.route)).toEqual([route]);
    }
  });
});
