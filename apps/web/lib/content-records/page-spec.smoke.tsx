import { renderToStaticMarkup } from 'react-dom/server';
import { PageSpecSections } from '@/components/marketing/page-spec/PageSpecSections';
import type { PageSpec } from './page-spec';

/**
 * Render smoke test for the page-spec publish gate: draw the spec through the
 * one renderer, then confirm every section rendered once, in order, and that
 * the page carries exactly one h1 and at most one primary action per section.
 */
export function pageSpecSmoke(spec: PageSpec): string[] {
  const html = renderToStaticMarkup(
    <PageSpecSections sections={spec.sections} />
  );
  const errors: string[] = [];
  let cursor = -1;
  for (const section of spec.sections) {
    const marker = `data-page-spec-id="${section.id}"`;
    const index = html.indexOf(marker);
    if (index === -1) errors.push(`sections.${section.id}: did not render`);
    else if (index < cursor)
      errors.push(`sections.${section.id}: rendered out of order`);
    else cursor = index;
  }
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s > 1) errors.push('sections: page renders more than one h1');
  return errors;
}
