/**
 * CI story-capture receipts for the component certificate (visual and a11y).
 *
 * A receipt only counts as a pass when it proves what it claims: the producer
 * schema, a source hash, at least one captured story, and every captured story
 * rendered in both the light and dark themes. Anything less is dropped, so the
 * certificate falls back to "unknown" (visual) or unit-test axe (a11y) instead
 * of trusting a partial capture. A failing receipt always stands: fail-closed.
 */

export const STORY_EVIDENCE_SCHEMA = 'jovie.component-story-evidence/v1';
export const REQUIRED_THEMES = Object.freeze(['light', 'dark']);

/** @returns {string | null} why a passing receipt can't be trusted, or null */
export function storyReceiptProblem(record) {
  if (!record || typeof record !== 'object') return 'not an object';
  if (record.schema !== STORY_EVIDENCE_SCHEMA)
    return `schema is not ${STORY_EVIDENCE_SCHEMA}`;
  if (
    typeof record.sourceHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(record.sourceHash)
  )
    return 'missing sha256 sourceHash';
  const stories = Array.isArray(record.stories) ? record.stories : [];
  if (!stories.length) return 'no captured stories';
  if (record.captured !== stories.length)
    return `captured ${record.captured} but lists ${stories.length} stories`;
  for (const story of stories) {
    const themes = new Set(Array.isArray(story?.themes) ? story.themes : []);
    const missing = REQUIRED_THEMES.filter(theme => !themes.has(theme));
    if (typeof story?.id !== 'string' || !story.id)
      return 'story without an id';
    if (missing.length)
      return `${story.id} not captured in ${missing.join(', ')}`;
  }
  return null;
}

/**
 * Keep failing receipts and fully proven passes; drop every other record.
 * @returns {{ components: Record<string, any>, rejected: Array<{ path: string, problem: string }> }}
 */
export function acceptStoryReceipts(components = {}) {
  const accepted = {};
  const rejected = [];
  for (const [path, record] of Object.entries(components ?? {})) {
    if (record?.status === 'fail') {
      accepted[path] = record;
      continue;
    }
    const problem =
      record?.status === 'pass'
        ? storyReceiptProblem(record)
        : `status ${record?.status ?? 'missing'}`;
    if (problem) rejected.push({ path, problem });
    else accepted[path] = record;
  }
  return { components: accepted, rejected };
}

/** A passing receipt for the given stories, each captured in light and dark. */
export function storyReceipt(sourceHash, storyIds = ['component--default']) {
  return {
    schema: STORY_EVIDENCE_SCHEMA,
    sourceHash,
    status: 'pass',
    captured: storyIds.length,
    stories: storyIds.map(id => ({ id, themes: [...REQUIRED_THEMES] })),
  };
}
