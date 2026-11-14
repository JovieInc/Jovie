/**
 * Headline and lead copy for the customer changelog: how an approved sentence
 * splits, how the editorial overlay replaces a headline, and the same overlay
 * applied to a date page's own bullets.
 */

import {
  type ChangelogRelease,
  type ChangelogSection,
  changelogInlineText,
} from './changelog-parser';
import {
  type CustomerChangelogEditorial,
  resolveCustomerChangelogEditorial,
} from './customer-changelog-editorial';

/** The Markdown strong delimiter around a headline on a date page. */
const BOLD = '*'.repeat(2);

export const SECTION_ORDER = [
  'featured',
  'added',
  'changed',
  'fixed',
  'removed',
] as const satisfies readonly (keyof ChangelogSection)[];

const AREA_LABEL_MAX_WORDS = 3;

function capitaliseFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A short prefix whose sentence carries on in lowercase after the separator
 * ("Artist profiles: the footer credit…") names a product area. It is a label,
 * not an outcome, so it never stands alone as a headline.
 */
function isAreaLabel(title: string, explanation: string): boolean {
  return (
    title.split(/\s+/).length <= AREA_LABEL_MAX_WORDS &&
    /^\p{Ll}/u.test(explanation)
  );
}

function splitApprovedSentence(entry: string): {
  readonly text: string;
  readonly title: string;
  readonly explanation: string;
  readonly areaLabel: boolean;
} {
  const text = changelogInlineText(entry).trim();
  const match =
    /^(.+?):\s+(.+)$/s.exec(text) ?? /^(.+?)\s+[—–]\s+(.+)$/s.exec(text);
  const title = match?.[1]?.trim() ?? '';
  const explanation = match?.[2]?.trim() ?? '';
  if (!title || !explanation || title.length > 140) {
    return { text, title: text, explanation: '', areaLabel: false };
  }
  return {
    text,
    title,
    explanation: capitaliseFirst(explanation),
    areaLabel: isAreaLabel(title, explanation),
  };
}

/**
 * Split approved copy into a headline and its explanation. The explanation
 * always starts with a capital. When the prefix is only an area label the
 * whole sentence stays the headline; the editorial overlay may supply a
 * better one.
 */
export function splitCustomerChangelogOutcome(entry: string): {
  readonly title: string;
  readonly explanation: string;
} {
  const split = splitApprovedSentence(entry);
  return split.areaLabel
    ? { title: split.text, explanation: '' }
    : { title: split.title, explanation: split.explanation };
}

/**
 * Headline and lead for one approved sentence. An overlay headline replaces
 * the split title and keeps the approved explanation (or the whole sentence)
 * as the lead; an overlay lead replaces only copy that went stale.
 */
export function resolveEntryCopy(
  bullet: string,
  edit: CustomerChangelogEditorial[string] | undefined
): { readonly title: string; readonly explanation: string } {
  if (!edit?.headline) return splitCustomerChangelogOutcome(bullet);
  const split = splitApprovedSentence(bullet);
  return {
    title: edit.headline,
    explanation: edit.lead ?? (split.explanation || split.text),
  };
}

export interface CustomerChangelogProjectionOptions {
  /** Defaults to the committed overlay; tests pass their own. */
  readonly editorial?: CustomerChangelogEditorial;
}

export function publicationQueueKey(
  section: keyof ChangelogSection,
  summary: string
) {
  return `${section}\u0000${summary}`;
}

/**
 * The same overlay for a date page, which renders a release's own bullets:
 * withdrawn outcomes are dropped and a headline leads its approved sentence.
 * Bullets without a publication receipt are the engineering record and pass
 * through untouched.
 */
export function applyCustomerChangelogEditorialToRelease(
  release: ChangelogRelease,
  options: CustomerChangelogProjectionOptions = {}
): ChangelogRelease {
  const editorial = options.editorial ?? resolveCustomerChangelogEditorial();
  const publications = release.customerOutcomes ?? [];
  if (!publications.some(publication => editorial[publication.entryId])) {
    return release;
  }

  const queues = new Map<string, typeof publications>();
  for (const publication of publications) {
    const key = publicationQueueKey(publication.section, publication.summary);
    queues.set(key, [...(queues.get(key) ?? []), publication]);
  }

  const withdrawn = new Set<string>();
  const customerOutcomes: typeof publications = [];
  const sections = { ...release.sections };
  for (const section of SECTION_ORDER) {
    sections[section] = release.sections[section].flatMap(bullet => {
      const publication = queues
        .get(publicationQueueKey(section, bullet))
        ?.shift();
      const edit = publication ? editorial[publication.entryId] : undefined;
      if (!publication || !edit) {
        if (publication) customerOutcomes.push(publication);
        return [bullet];
      }
      if (edit.hide) {
        withdrawn.add(changelogInlineText(bullet).trim());
        return [];
      }
      const copy = resolveEntryCopy(bullet, edit);
      const rewritten = [BOLD, copy.title, BOLD, ' ', copy.explanation].join(
        ''
      );
      customerOutcomes.push({ ...publication, summary: rewritten });
      return [rewritten];
    });
  }
  // Receipted outcomes with no bullet keep their identity for tombstones.
  for (const queue of queues.values()) customerOutcomes.push(...queue);

  return {
    ...release,
    summary: withdrawn.has(changelogInlineText(release.summary).trim())
      ? ''
      : release.summary,
    sections,
    customerOutcomes,
  };
}
