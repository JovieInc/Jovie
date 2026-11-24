import { describe, expect, it } from 'vitest';
import { primaryNavigation } from '@/components/features/dashboard/dashboard-nav/config';
import { BREADCRUMB_LABELS } from '@/lib/constants/breadcrumb-labels';
import {
  CREATOR_ROOT_LABELS,
  getProductProjection,
  PRODUCT_ONTOLOGY,
  PRODUCT_ONTOLOGY_PREVIOUS_LABELS,
} from './productOntology';

describe('product ontology UI ban (Drift T0.2)', () => {
  it('keeps creator root labels as Home · Identity · Work · Audience', () => {
    expect(primaryNavigation.map(item => item.name)).toEqual([
      ...CREATOR_ROOT_LABELS,
    ]);
  });

  it('never projects previousLabels into the product projection', () => {
    const projection = getProductProjection();
    for (const feature of projection.features) {
      expect(feature).not.toHaveProperty('previousLabels');
      expect(PRODUCT_ONTOLOGY_PREVIOUS_LABELS).not.toContain(feature.label);
    }
  });

  it('bans previousLabels from breadcrumb and primary-nav chrome', () => {
    const chromeLabels = [
      ...Object.values(BREADCRUMB_LABELS),
      ...primaryNavigation.map(item => item.name),
      ...Object.values(PRODUCT_ONTOLOGY).map(feature => feature.label),
    ];

    for (const banned of PRODUCT_ONTOLOGY_PREVIOUS_LABELS) {
      expect(chromeLabels).not.toContain(banned);
    }
  });
});
