/**
 * How a brand relates to Jovie when its logo appears. Lives apart from
 * proof.ts so the logo permission gate does not pull the whole proof
 * registry (and the route manifest) into every page that renders a logo slot.
 */
export const LOGO_RELATIONSHIPS = ['customer', 'integration', 'press'] as const;

export type LogoRelationship = (typeof LOGO_RELATIONSHIPS)[number];
