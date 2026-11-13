/**
 * Deterministic check of the customer changelog editorial overlay
 * (apps/web/data/customer-changelog-editorial.json) against the published
 * CHANGELOG.md. See docs/CHANGELOG_PUBLICATION.md ("Headlines").
 */
import { headlineProblems, splitHeadline } from './changelog-filter-rules.mjs';
import { extractDailyReceipts } from './daily-changelog.mjs';

export const HEADLINE_WINDOW_DAYS = 30;

function publishedEntries(markdown, migrations) {
  const entries = [];
  for (const receipt of extractDailyReceipts(markdown)) {
    const date = receipt.window?.key;
    if (!date || !Array.isArray(receipt.stories)) continue;
    for (const story of receipt.stories) {
      const migrated = (migrations?.entries ?? []).find(
        candidate =>
          candidate.releaseKey === date &&
          (story.id
            ? candidate.storyId === story.id
            : Array.isArray(story.sourceIds) &&
              candidate.sourceIds.length === story.sourceIds.length &&
              candidate.sourceIds.every(id => story.sourceIds.includes(id)))
      );
      const entryId = story.entryId ?? migrated?.entryId;
      if (entryId) entries.push({ entryId, date, summary: story.summary });
    }
  }
  return entries;
}

/**
 * Check the editorial overlay against the published changelog:
 * - every overlay key is a published entry id;
 * - every overlay entry is well formed;
 * - every entry published in the newest HEADLINE_WINDOW_DAYS days has a
 *   headline: an overlay headline, a withdrawal, or a compliant split.
 * The window ends at the newest published date, so the result depends only
 * on the two files, never on the clock.
 */
export function checkEditorialOverlay({ markdown, overlay, migrations }) {
  const errors = [];
  if (overlay?.schema !== 'customer-changelog-editorial/v1')
    errors.push('overlay schema must be customer-changelog-editorial/v1');
  const edits = overlay?.entries ?? {};
  const entries = publishedEntries(markdown, migrations);
  const known = new Set(entries.map(entry => entry.entryId));

  for (const [entryId, edit] of Object.entries(edits)) {
    if (!known.has(entryId))
      errors.push(
        `${entryId}: not a published entry id. Use the entryId from the daily receipt in CHANGELOG.md.`
      );
    if (edit?.hide === true) {
      if (!edit.reason)
        errors.push(`${entryId}: a hidden entry needs a reason.`);
      if (edit.headline || edit.lead || edit.media)
        errors.push(`${entryId}: a hidden entry carries only its reason.`);
      continue;
    }
    if (!edit?.headline) {
      errors.push(`${entryId}: needs a headline or hide: true.`);
      continue;
    }
    for (const problem of headlineProblems(edit.headline))
      errors.push(`${entryId}: headline "${edit.headline}" ${problem}.`);
    if (edit.lead !== undefined && !/^[\p{Lu}\p{N}]/u.test(edit.lead))
      errors.push(`${entryId}: lead must start with a capital letter.`);
    if (
      edit.media !== undefined &&
      !/^\/images\/changelog\//.test(edit.media?.src ?? '')
    )
      errors.push(`${entryId}: media src must live under /images/changelog/.`);
  }

  const newest = entries
    .map(entry => entry.date)
    .sort()
    .at(-1);
  if (newest) {
    const cutoff = new Date(
      Date.parse(`${newest}T00:00:00Z`) - HEADLINE_WINDOW_DAYS * 86_400_000
    )
      .toISOString()
      .slice(0, 10);
    for (const entry of entries) {
      if (entry.date < cutoff || edits[entry.entryId]) continue;
      const split = splitHeadline(entry.summary);
      const problems = split
        ? [
            ...headlineProblems(split.headline),
            ...(/^[\p{Lu}\p{N}"“]/u.test(split.explanation)
              ? []
              : ['is followed by a lowercase explanation']),
          ]
        : [
            'is missing: the approved copy has no "Headline: explanation" split',
          ];
      if (problems.length)
        errors.push(
          `${entry.entryId} (${entry.date}): headline ${problems.join('; ')}. Add a headline for it to apps/web/data/customer-changelog-editorial.json.`
        );
    }
  }
  return { errors, checked: entries.length };
}
