/**
 * Decision log over gbrain pages + takes. A decision is a `type: decision`
 * page under decisions/<area>/<slug> carrying context, options, evidence and
 * the repo's Ship now / Re-evaluate when / Then convention, plus one take
 * (the chosen claim) so takes_calibration can score it later.
 *
 * Re-evaluation never overwrites: a trigger (new model, tool, data, price)
 * creates a proposed review page that links the old decision and adds a
 * timeline entry to it. Only an explicit resolve changes the old status.
 */
import type { GbrainClient, GbrainHit } from './gbrain.ts';

export type DecisionStatus = 'proposed' | 'active' | 'superseded' | 'retired';
export type ReviewStatus = 'proposed' | 'kept' | 'superseded';
export type TriggerKind =
  | 'model'
  | 'tool'
  | 'data'
  | 'price'
  | 'incident'
  | 'other';

export interface DecisionInput {
  readonly area: string;
  readonly title: string;
  readonly context: string;
  readonly options: readonly { name: string; summary: string }[];
  readonly chosen: string;
  readonly evidence: readonly string[];
  readonly shipNow: string;
  readonly reevaluateWhen: readonly string[];
  readonly then: string;
  readonly status?: DecisionStatus;
  readonly supersedes?: string;
  readonly confidence?: number;
  readonly slug?: string;
  readonly date?: string;
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const today = () => new Date().toISOString().slice(0, 10);
const q = (s: string) => JSON.stringify(s);
const link = (ref: string) =>
  /^https?:/.test(ref) ? ref : `[[${ref.replace(/^gbrain:/, '')}]]`;

export function decisionSlug(
  input: Pick<DecisionInput, 'area' | 'title' | 'slug'>
): string {
  return (
    input.slug ?? `decisions/${slugify(input.area)}/${slugify(input.title)}`
  );
}

export function decisionPage(input: DecisionInput): string {
  const date = input.date ?? today();
  if (!input.options.some(o => o.name === input.chosen)) {
    throw new Error(`chosen option "${input.chosen}" is not among the options`);
  }
  if (input.reevaluateWhen.length === 0) {
    throw new Error('a decision needs at least one Re-evaluate when trigger');
  }
  return [
    '---',
    'type: decision',
    `title: ${q(input.title)}`,
    `area: ${q(input.area)}`,
    `status: ${input.status ?? 'active'}`,
    `decided_at: ${date}`,
    `chosen: ${q(input.chosen)}`,
    `reevaluate_when: [${input.reevaluateWhen.map(q).join(', ')}]`,
    ...(input.supersedes ? [`supersedes: ${input.supersedes}`] : []),
    'tags: [decision]',
    '---',
    '',
    `# ${input.title}`,
    '',
    '## Context',
    '',
    input.context.trim(),
    '',
    '## Options',
    '',
    ...input.options.map(
      o =>
        `- **${o.name}**${o.name === input.chosen ? ' (chosen)' : ''}: ${o.summary}`
    ),
    '',
    '## Decision',
    '',
    `**Ship now:** ${input.shipNow}`,
    '',
    `**Re-evaluate when:** ${input.reevaluateWhen.join('; ')}`,
    '',
    `**Then:** ${input.then}`,
    '',
    '## Evidence',
    '',
    ...(input.evidence.length
      ? input.evidence.map(e => `- ${link(e)}`)
      : ['- none recorded']),
    ...(input.supersedes ? ['', `Supersedes [[${input.supersedes}]].`] : []),
    '',
  ].join('\n');
}

export async function recordDecision(
  gbrain: GbrainClient,
  input: DecisionInput
): Promise<string> {
  const slug = decisionSlug(input);
  const existing = await gbrain
    .call<{ slug?: string } | string>('get_page', { slug })
    .catch(() => null);
  if (
    existing &&
    typeof existing === 'object' &&
    existing.slug &&
    !input.supersedes
  ) {
    throw new Error(
      `${slug} already exists; record a new decision with --supersedes or open a review`
    );
  }
  await gbrain.call('put_page', { slug, content: decisionPage(input) });
  await gbrain.call('takes_add', {
    slug,
    claim: `${input.title}: ${input.chosen}`.slice(0, 280),
    kind: 'take',
    holder: 'brain',
    weight: input.confidence ?? 0.7,
    since: input.date ?? today(),
    source: input.evidence[0] ?? 'jovie-research decision',
  });
  if (input.supersedes) {
    await gbrain.call('add_link', {
      from: slug,
      to: input.supersedes,
      link_type: 'supersedes',
      link_source: 'decision-log',
    });
    await gbrain.call('add_timeline_entry', {
      slug: input.supersedes,
      date: input.date ?? today(),
      summary: `Superseded by ${slug}`,
      source: slug,
    });
    await setStatus(gbrain, input.supersedes, 'superseded', slug);
  }
  return slug;
}

/** Round-trips the page so only frontmatter status changes; body stays as written. */
export async function setStatus(
  gbrain: GbrainClient,
  slug: string,
  status: DecisionStatus | ReviewStatus,
  by?: string
): Promise<void> {
  const page = await gbrain.call<{ content?: string }>('get_page', {
    slug,
    include_content: true,
  });
  const content = page?.content;
  if (!content?.startsWith('---'))
    throw new Error(`${slug}: no frontmatter to update`);
  let next = content.replace(/^status: .*$/m, `status: ${status}`);
  if (!/^status: /m.test(content))
    next = next.replace(/^---\n/, `---\nstatus: ${status}\n`);
  if (by && status === 'superseded') {
    next = /^superseded_by: /m.test(next)
      ? next.replace(/^superseded_by: .*$/m, `superseded_by: ${by}`)
      : next.replace(/^status: .*$/m, `$&\nsuperseded_by: ${by}`);
  }
  if (next !== content) await gbrain.call('put_page', { slug, content: next });
}

export async function findDecisions(
  gbrain: GbrainClient,
  topic: string,
  limit = 8
): Promise<GbrainHit[]> {
  const rows = await gbrain.call<GbrainHit[]>('search', {
    query: topic,
    limit,
    snippet_chars: 300,
    types: ['decision', 'architecture-decision', 'research-decision'],
  });
  return Array.isArray(rows) ? rows : [];
}

export interface TriggerInput {
  readonly trigger: string;
  readonly kind: TriggerKind;
  readonly evidence: readonly string[];
  /** Restrict to decisions whose topic matches; defaults to the trigger text. */
  readonly topic?: string;
  readonly minScore?: number;
  readonly dryRun?: boolean;
  readonly date?: string;
}

export function reviewPage(
  old: GbrainHit,
  input: TriggerInput,
  date: string
): string {
  return [
    '---',
    'type: decision-review',
    `title: ${q(`Review: ${old.title ?? old.slug}`)}`,
    'status: proposed',
    `reviews: ${old.slug}`,
    `trigger_kind: ${input.kind}`,
    `trigger: ${q(input.trigger)}`,
    `proposed_at: ${date}`,
    'tags: [decision-review]',
    '---',
    '',
    `# Review: ${old.title ?? old.slug}`,
    '',
    `A ${input.kind} change may invalidate [[${old.slug}]]. The old decision stays in force until this review resolves.`,
    '',
    `**Trigger:** ${input.trigger}`,
    '',
    '## Evidence',
    '',
    ...(input.evidence.length
      ? input.evidence.map(e => `- ${link(e)}`)
      : ['- none attached yet']),
    '',
    '## To resolve',
    '',
    `1. Re-run the decision's measurement against the trigger (\`jovie-research ask\` for evidence).`,
    `2. Keep: \`jovie-research decision resolve <this-slug> --keep --evidence <...>\`.`,
    `3. Change: \`jovie-research decision record ... --supersedes ${old.slug}\`, then resolve this review with --superseded.`,
    '',
  ].join('\n');
}

/**
 * Propose reviews for decisions a trigger may invalidate. Returns the
 * matched decisions and the review slugs created (none in dry-run).
 */
export async function proposeReviews(
  gbrain: GbrainClient,
  input: TriggerInput
): Promise<{ decision: string; review: string | null; score: number }[]> {
  const date = input.date ?? today();
  const minScore = input.minScore ?? 0.55;
  const candidates = (
    await findDecisions(gbrain, input.topic ?? input.trigger, 10)
  ).filter(
    d =>
      (d.score ?? 0) >= minScore &&
      d.type !== 'decision-review' &&
      d.status !== 'superseded'
  );
  const out: { decision: string; review: string | null; score: number }[] = [];
  for (const d of candidates) {
    const review = `decisions/reviews/${date}-${slugify(d.slug.split('/').at(-1) ?? d.slug)}`;
    if (input.dryRun) {
      out.push({ decision: d.slug, review: null, score: d.score ?? 0 });
      continue;
    }
    await gbrain.call('put_page', {
      slug: review,
      content: reviewPage(d, input, date),
    });
    await gbrain.call('add_link', {
      from: review,
      to: d.slug,
      link_type: 'reviews',
      link_source: 'decision-log',
    });
    await gbrain.call('add_timeline_entry', {
      slug: d.slug,
      date,
      summary: `Re-evaluation proposed (${input.kind}): ${input.trigger}`.slice(
        0,
        200
      ),
      source: review,
    });
    out.push({ decision: d.slug, review, score: d.score ?? 0 });
  }
  return out;
}

export async function resolveReview(
  gbrain: GbrainClient,
  reviewSlug: string,
  outcome: 'kept' | 'superseded',
  evidence: readonly string[] = []
): Promise<void> {
  const page = await gbrain.call<{ content?: string }>('get_page', {
    slug: reviewSlug,
    include_content: true,
  });
  const old = page?.content?.match(/^reviews: (.+)$/m)?.[1]?.trim();
  if (!old) throw new Error(`${reviewSlug} is not a decision review`);
  await setStatus(gbrain, reviewSlug, outcome);
  await gbrain.call('add_timeline_entry', {
    slug: old,
    date: today(),
    summary:
      outcome === 'kept'
        ? `Re-affirmed after review ${reviewSlug}`
        : `Review ${reviewSlug} led to supersession`,
    source: evidence[0] ?? reviewSlug,
  });
  if (outcome === 'kept') {
    await gbrain.call('takes_add', {
      slug: old,
      claim: `Re-affirmed ${today()} after ${reviewSlug}`,
      kind: 'fact',
      holder: 'brain',
      weight: 0.8,
      source: evidence[0] ?? reviewSlug,
    });
  }
}

/** Contradiction findings and active takes for one decision. */
export async function checkDecision(gbrain: GbrainClient, slug: string) {
  const [contradictions, takes] = await Promise.all([
    gbrain
      .call('find_contradictions', { slug, limit: 10 })
      .catch(e => ({ error: (e as Error).message })),
    gbrain
      .call('takes_list', { page_slug: slug, limit: 20 })
      .catch(e => ({ error: (e as Error).message })),
  ]);
  return { slug, contradictions, takes };
}
