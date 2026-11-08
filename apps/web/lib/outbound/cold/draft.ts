import { lintCopy } from '@jovie/copy';
import { COLD_SEQUENCE, type ColdStepKind } from './sequence';

/**
 * Machine drafts for cold outreach in Tim's voice (register `founder-tim`).
 *
 * Every claim in a draft comes from the certified artifact we built for the
 * person, which in turn comes from their own public catalog. The composer
 * takes no free text from a model, so it cannot invent a number, a result or
 * a relationship. Plain text, one link, no pitch.
 *
 * The CAN-SPAM footer (mailing address, unsubscribe) is not part of the body
 * Tim edits. The send adapter appends it; see compliance.ts.
 */

export const COLD_TEMPLATE_VERSION = 'cold-draft/v1';

/** Facts read from the certified artifact. Nothing else may be claimed. */
export interface ColdArtifactFacts {
  /** The artist name exactly as their catalog shows it. */
  readonly artistName: string;
  /** A first name only when the person's own public page states it. */
  readonly firstName: string | null;
  /** The private claim link for the draft we built. */
  readonly claimUrl: string;
  /** What we built: a profile, or a release page with a smart link. */
  readonly artifact: 'profile' | 'release_page';
  /** Newest release in their catalog, when one is on file. */
  readonly latestRelease: {
    readonly title: string;
    /** ISO date, YYYY-MM-DD. */
    readonly releasedOn: string;
  } | null;
  /** Streaming services the built page links to, from the catalog match. */
  readonly platformCount: number;
  /** Releases on the built page. */
  readonly releaseCount: number;
}

export interface ColdDraftStep {
  readonly index: number;
  readonly kind: ColdStepKind;
  readonly subject: string;
  readonly body: string;
}

export interface ColdDraft {
  readonly templateVersion: string;
  readonly steps: readonly ColdDraftStep[];
  /** Each claim the draft makes and the artifact fact it rests on. */
  readonly claims: readonly { readonly text: string; readonly fact: string }[];
  /** Blocking `founder-tim` lint rules per step; empty when clean. */
  readonly lint: readonly {
    readonly index: number;
    readonly rules: readonly string[];
  }[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthOf(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate);
  if (!match) return null;
  return MONTHS[Number(match[2]) - 1] ?? null;
}

/** "Hey Ada," when a first name is on file, else "Hey," and never the handle. */
function greeting(facts: ColdArtifactFacts): string {
  const name = facts.firstName?.trim();
  return name ? `Hey ${name},` : 'Hey,';
}

/** Recent enough to mention by name (90 days, the queue's "why now" window). */
export function isRecentRelease(
  release: ColdArtifactFacts['latestRelease'],
  now: Date
): boolean {
  if (!release) return false;
  const released = Date.parse(`${release.releasedOn}T00:00:00Z`);
  if (Number.isNaN(released) || released > now.getTime()) return false;
  return now.getTime() - released < 90 * 86_400_000;
}

function firstTouch(
  facts: ColdArtifactFacts,
  now: Date,
  claims: { text: string; fact: string }[]
): { subject: string; body: string } {
  const release = facts.latestRelease;
  const recent = isRecentRelease(release, now);
  const lines: string[] = [greeting(facts), ''];
  let subject: string;
  if (facts.artifact === 'release_page' && release && recent) {
    const month = monthOf(release.releasedOn);
    subject = `${release.title}`;
    lines.push(
      `I made a page for "${release.title}"${month ? `, your ${month} release` : ''}. It sends people to whichever app they already use.`
    );
    claims.push({
      text: `release ${release.title}${month ? ` (${month})` : ''}`,
      fact: 'latestRelease',
    });
  } else {
    subject = `${facts.artistName} page`;
    const releases =
      facts.releaseCount > 0
        ? ` with your ${facts.releaseCount === 1 ? 'release' : `${facts.releaseCount} releases`}`
        : '';
    lines.push(
      `I made a page for ${facts.artistName}${releases} pulled from your public catalog.${
        release && recent ? ` "${release.title}" is on it.` : ''
      }`
    );
    if (facts.releaseCount > 0)
      claims.push({
        text: `${facts.releaseCount} releases`,
        fact: 'releaseCount',
      });
    if (release && recent)
      claims.push({ text: `release ${release.title}`, fact: 'latestRelease' });
  }
  if (facts.platformCount > 1) {
    lines.push(
      `Every streaming link is already on it (${facts.platformCount} services).`
    );
    claims.push({
      text: `${facts.platformCount} services`,
      fact: 'platformCount',
    });
  }
  lines.push(
    '',
    "It's yours if you want it:",
    facts.claimUrl,
    '',
    "If it's not useful, ignore this and I won't keep at it.",
    '',
    'Tim'
  );
  return { subject, body: lines.join('\n') };
}

function newValue(
  facts: ColdArtifactFacts,
  now: Date,
  claims: { text: string; fact: string }[]
): { subject: string; body: string } | null {
  // A second touch must add something true and new. With a release page the
  // new thing is the smart link itself; with only a profile, there is nothing
  // new to say, so the step becomes a check-in.
  const release = facts.latestRelease;
  if (facts.artifact !== 'release_page' || !release) return null;
  if (!isRecentRelease(release, now)) return null;
  claims.push({ text: `smart link for ${release.title}`, fact: 'artifact' });
  return {
    subject: `${release.title} link`,
    body: [
      greeting(facts),
      '',
      `One more thing on "${release.title}": the page works as a smart link, so you can drop one URL in your bio and posts and it opens the right app for each person.`,
      '',
      facts.claimUrl,
      '',
      'Tim',
    ].join('\n'),
  };
}

function checkIn(
  facts: ColdArtifactFacts,
  step: number
): { subject: string; body: string } {
  const last = step === COLD_SEQUENCE.length - 1;
  return {
    subject: `${facts.artistName} page`,
    body: [
      greeting(facts),
      '',
      last
        ? `Last note from me. The ${facts.artistName} page is still there if you want it:`
        : `Checking you saw this. The ${facts.artistName} page is still there:`,
      facts.claimUrl,
      '',
      last ? "If not, no worries. I won't email again." : 'Tim',
      ...(last ? ['', 'Tim'] : []),
    ].join('\n'),
  };
}

/** Compose the full sequence from artifact facts. Deterministic. */
export function composeColdSequence(
  facts: ColdArtifactFacts,
  now: Date
): ColdDraft {
  const claims: { text: string; fact: string }[] = [];
  const steps: ColdDraftStep[] = COLD_SEQUENCE.map(step => {
    let copy: { subject: string; body: string };
    if (step.kind === 'first_touch') copy = firstTouch(facts, now, claims);
    else if (step.kind === 'new_value')
      copy = newValue(facts, now, claims) ?? checkIn(facts, step.index);
    else copy = checkIn(facts, step.index);
    return { index: step.index, kind: step.kind, ...copy };
  });
  const lint = steps
    .map(step => ({
      index: step.index,
      rules: [
        ...new Set(
          lintCopy(`${step.subject}\n\n${step.body}`, {
            register: 'founder-tim',
          }).blocking.map(finding => finding.rule)
        ),
      ],
    }))
    .filter(entry => entry.rules.length > 0);
  return { templateVersion: COLD_TEMPLATE_VERSION, steps, claims, lint };
}
