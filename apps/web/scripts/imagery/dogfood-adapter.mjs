// Thin adapter over the dogfood judge rubric (scripts/dogfood-judge/rubric.mjs,
// PR #23746) so imagery verification judges against Tim's taste rubric and the
// cold-screenshot test ("what's wrong with this?") instead of a copy of them.
//
// DEPENDENCY: until #23746 merges the rubric is not on this branch. Set
// DOGFOOD_JUDGE_RUBRIC=/abs/path/to/rubric.mjs to use that branch's file; with
// neither present the adapter reports `unavailable` and verification fails
// closed (an unjudged asset is an unverified asset).
//
// Transport is Workers AI vision (the dogfood judge's own transport is the
// subscription `claude` CLI, which is not on the render host), so the adapter
// only builds prompts and parses answers; it never calls a model.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Rubric criteria that apply to marketing imagery (slugs in rubric.mjs). */
export const IMAGERY_CRITERIA = Object.freeze([
  'matte-monochrome',
  'premium-imagery',
  'optical-alignment',
  'no-tiles-or-lone-cards',
]);

export async function loadDogfoodRubric(
  repoRoot,
  env = process.env,
  importer = specifier => import(specifier)
) {
  const candidates = [
    join(repoRoot, 'scripts/dogfood-judge/rubric.mjs'),
    env.DOGFOOD_JUDGE_RUBRIC,
  ].filter(Boolean);
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const rubric = await importer(pathToFileURL(file).href);
    return { rubric, source: file };
  }
  return null;
}

/**
 * Cold prompt for an attached image: the dogfood cold pass wording verbatim,
 * with one line saying the image is attached rather than a file to Read.
 */
export function coldPrompt(rubric, imageName = 'image') {
  const base = rubric.buildColdPrompt([{ name: imageName, path: imageName }]);
  return `The image is attached to this message. Wherever the text below says to open or Read it, look at the attached image instead.\n\n${base}\n\nReply with JSON only: {"issues":[{"credible":boolean,"severity":"blocker"|"major"|"minor","bbox":[x,y,w,h],"detail":string}]}`;
}

/** Tolerant parse of a model's cold answer into dogfood's validated shape. */
export function parseCold(rubric, raw, imageName = 'image') {
  const issues = (Array.isArray(raw?.issues) ? raw.issues : []).map(issue => {
    const bbox = Array.isArray(issue?.bbox) ? issue.bbox.map(Number) : [];
    return {
      credible: Boolean(issue?.credible),
      severity: issue?.severity,
      bbox:
        bbox.length === 4 && bbox.every(v => v >= 0 && v <= 1)
          ? bbox
          : [0, 0, 1, 1],
      detail: String(issue?.detail ?? ''),
    };
  });
  const [parsed] = rubric.parseColdOutput(
    { images: [{ image: imageName, issues }] },
    [imageName]
  );
  return {
    issues: parsed.issues,
    fails: rubric.coldFails(parsed.issues),
  };
}

export function criteriaFor(rubric, slugs = IMAGERY_CRITERIA) {
  return slugs.map(slug => {
    const criterion = rubric.CRITERIA.find(c => c.slug === slug);
    if (!criterion) throw new Error(`dogfood rubric has no criterion ${slug}`);
    return criterion;
  });
}

export function rubricPrompt(rubric, slugs = IMAGERY_CRITERIA) {
  const lines = criteriaFor(rubric, slugs).map(
    c =>
      `${c.id} ${c.title} [${c.severity}]\n  Look: ${c.look}\n  Passes like: ${c.pass.join(' | ')}`
  );
  return `You review one marketing image for Jovie against Tim's taste rubric. The image is a dark, matte, product-led composite of real UI over an abstract plate. Judge only these criteria:\n\n${lines.join('\n\n')}\n\nFor each criterion decide pass or fail. Judge what is visible in this image; never repeat an example from this prompt. Fail only on what the Look text names; do not invent issues.\nReply with JSON only: {"findings":[{"criterion":"TT-xx","pass":boolean,"severity":"blocker"|"major"|"minor","detail":string}]}`;
}

/** Findings that failed, validated against the rubric ids; verdict by dogfood's rule. */
export function parseRubric(rubric, raw, slugs = IMAGERY_CRITERIA) {
  const ids = new Set(criteriaFor(rubric, slugs).map(c => c.id));
  const findings = (Array.isArray(raw?.findings) ? raw.findings : [])
    .filter(f => ids.has(f?.criterion) && f.pass === false)
    .map(f => ({
      id: f.criterion,
      severity: rubric.SEVERITIES.includes(f.severity) ? f.severity : 'minor',
      detail: String(f.detail ?? ''),
    }));
  return { findings, fails: rubric.stepVerdict(findings) === 'fail' };
}
