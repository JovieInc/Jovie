import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getQaSwarmPaths } from './paths.mjs';
import { getRecipe } from './registry.mjs';

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * @param {import('./types.mjs').QaSwarmFinding} finding
 * @param {object} context
 * @param {string} context.recipeId
 * @param {string} [context.runId]
 */
export function buildGbrainSlug(finding, context) {
  const recipe = getRecipe(context.recipeId);
  const date = new Date().toISOString().slice(0, 10);
  const runPart = context.runId ? `${slugify(context.runId)}/` : '';

  return `qa-swarm/${recipe.id}/${date}/${runPart}${slugify(finding.id)}`;
}

/**
 * @param {import('./types.mjs').QaSwarmFinding} finding
 * @param {object} context
 * @param {string} context.recipeId
 * @param {string} [context.runId]
 */
export function buildGbrainPage(finding, context) {
  const recipe = getRecipe(context.recipeId);
  const slug = buildGbrainSlug(finding, context);

  const evidence =
    finding.evidencePaths.length > 0
      ? finding.evidencePaths.map(item => `- ${item}`).join('\n')
      : '- None';

  return {
    slug,
    title: `QA swarm: ${finding.title}`,
    body: [
      `# ${finding.title}`,
      '',
      `Recipe: **${recipe.title}** (\`${recipe.id}\`)`,
      `Priority: **${finding.priority}**`,
      `Kind: ${finding.kind}`,
      context.runId ? `Run: \`${context.runId}\`` : null,
      finding.surface ? `Surface: ${finding.surface}` : null,
      typeof finding.polishScore === 'number'
        ? `Polish score: ${finding.polishScore}/10`
        : null,
      finding.referenceComp ? `Reference comp: ${finding.referenceComp}` : null,
      '',
      '## Summary',
      finding.summary,
      '',
      finding.reproduction ? '## Reproduction' : null,
      finding.reproduction ?? null,
      finding.reproduction ? '' : null,
      '## Evidence',
      evidence,
      '',
      '## Metadata',
      '```json',
      JSON.stringify(
        {
          recipeId: recipe.id,
          findingId: finding.id,
          priority: finding.priority,
          kind: finding.kind,
          metadata: finding.metadata ?? {},
        },
        null,
        2
      ),
      '```',
    ]
      .filter(line => line !== null)
      .join('\n'),
  };
}

/**
 * @param {import('./types.mjs').QaSwarmFinding} finding
 * @param {object} context
 * @param {string} context.recipeId
 * @param {string} [context.runId]
 */
export function persistGbrainFinding(finding, context) {
  const paths = getQaSwarmPaths();
  const page = buildGbrainPage(finding, context);

  mkdirSync(paths.findingsRoot, { recursive: true });
  const pagePath = path.join(
    paths.findingsRoot,
    `${page.slug.replaceAll('/', '__')}.md`
  );
  writeFileSync(pagePath, `${page.body}\n`, 'utf8');

  mkdirSync(paths.contextRoot, { recursive: true });
  appendFileSync(
    paths.gbrainQueuePath,
    `${JSON.stringify({
      slug: page.slug,
      title: page.title,
      pagePath,
      recipeId: context.recipeId,
      findingId: finding.id,
      priority: finding.priority,
      ts: new Date().toISOString(),
    })}\n`
  );

  return {
    slug: page.slug,
    pagePath,
  };
}
