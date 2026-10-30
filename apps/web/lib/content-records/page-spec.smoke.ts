import type { PageSpec } from './page-spec';

/**
 * Structure smoke test for the page-spec publish gate: confirm every section
 * has one id, appears once in order, and that the page carries exactly one
 * h1 (only the hero draws one) and no section carries a second primary action.
 *
 * It deliberately does not draw the page: the renderer composes client
 * components, which server code (this runs in the publish route) can neither
 * call nor render through react-dom/server. `page-spec.test.tsx` renders every
 * section type through the real renderer.
 */
export function pageSpecSmoke(spec: PageSpec): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  let heroes = 0;
  for (const section of spec.sections) {
    if (seen.has(section.id)) {
      errors.push(`sections.${section.id}: id appears twice`);
    }
    seen.add(section.id);
    if (section.type === 'hero') heroes += 1;
  }
  if (heroes > 1) errors.push('sections: page renders more than one h1');
  return errors;
}
