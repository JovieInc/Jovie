import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** A source snapshot belongs to one certification run, never a global cache. */
export function createStoryInventoryValidator({
  repoRoot,
  stories: canonicalStories,
  storyId,
}) {
  const sources = new Map();
  return (options = {}) => {
    const stories = options.stories ?? canonicalStories;
    const issues = [];
    const allowSubset = options.allowSubset === true;
    if (!Array.isArray(stories) || (!allowSubset && stories.length !== 6)) {
      issues.push(
        `canonical live inventory must declare exactly 6 seeded primitive stories; found ${Array.isArray(stories) ? stories.length : 0}`
      );
    }
    const ids = new Set();
    for (const story of stories ?? []) {
      if (!story || typeof story !== 'object' || Array.isArray(story)) {
        issues.push('canonical story entry is missing');
        continue;
      }
      const importPath = String(story.importPath || '')
        .trim()
        .replace(/\\/g, '/');
      if (
        !importPath.startsWith('packages/ui/atoms/') ||
        importPath.includes('..')
      ) {
        issues.push(
          `${story.id ?? importPath}: canonical import path must be packages/ui/atoms/*`
        );
      }
      const abs = resolve(repoRoot, importPath);
      if (!existsSync(abs)) {
        issues.push(
          `${story.id ?? importPath}: canonical story file is missing`
        );
        continue;
      }
      // Several stories share one CSF file. Snapshot each file once per run;
      // never retain sources across certification runs or hide local edits.
      if (!sources.has(abs)) sources.set(abs, readFileSync(abs, 'utf8'));
      const source = sources.get(abs);
      if (
        !source.includes(`title: '${story.title}'`) &&
        !source.includes(`title: "${story.title}"`)
      ) {
        issues.push(
          `${story.id}: story title ${story.title} is not declared in ${importPath}`
        );
      }
      if (!new RegExp(`export const ${story.exportName}\\b`).test(source)) {
        issues.push(
          `${story.id}: export ${story.exportName} is not declared in ${importPath}`
        );
      }
      const computed = storyId(story.title, story.exportName);
      if (computed !== story.id) {
        issues.push(
          `${story.id}: computed story id is ${computed}; inventory id must match exactly`
        );
      }
      if (ids.has(story.id))
        issues.push(`${story.id}: duplicate canonical story id`);
      ids.add(story.id);
    }
    return { ok: issues.length === 0, issues, stories };
  };
}
