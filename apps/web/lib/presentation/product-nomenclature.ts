import {
  PRODUCT_ONTOLOGY,
  TOP_LEVEL_PRODUCT_CONCEPTS,
} from '@/data/productOntology';
import { defineNomenclature, displayText } from './contracts';

/** Projection of the existing owner, not a second source of labels or placement.
 * This is the two-concept foundation, not a complete shell route registry.
 * Wave-1 route owners retain their consumers until coordinated adoption.
 */
export const productNomenclature = defineNomenclature(
  TOP_LEVEL_PRODUCT_CONCEPTS.map(routeId => {
    const concept = PRODUCT_ONTOLOGY[routeId];
    const noun = displayText(concept.label);
    return {
      routeId,
      route: concept.canonicalRoute,
      noun,
      navLabel: noun,
      title: noun,
      parent: null,
      switcher: [],
    };
  })
);
