/**
 * Chat wire-format tokens for entity mentions and skill invocations.
 *
 * Messages travel the wire as plain strings. Entity references and skill
 * invocations are encoded as stable tokens the server can resolve to IDs
 * without re-asking the model to infer them:
 *
 *   @release:rel_abc123[Midnight Drive]
 *   @artist:art_xyz[Porter Robinson]
 *   @track:trk_001[Opus]
 *   /skill:generateAlbumArt
 *
 * Pure functions — no React, no fetching. Safe to import from server code.
 */

export type EntityKind = 'release' | 'artist' | 'track';

export interface EntityMentionToken {
  readonly type: 'entity';
  readonly kind: EntityKind;
  readonly id: string;
  readonly label: string;
}

export interface SkillToken {
  readonly type: 'skill';
  readonly id: string;
}

export interface TextToken {
  readonly type: 'text';
  readonly value: string;
}

export type ChatToken = TextToken | EntityMentionToken | SkillToken;

const ENTITY_KINDS: readonly EntityKind[] = ['release', 'artist', 'track'];

/**
 * Match an entity mention: @kind:id[label]
 * - kind: release | artist | track
 * - id: non-empty, no whitespace, no ]
 * - label: any chars except unescaped ] (use \] to include a literal ])
 */
const ENTITY_PATTERN =
  /@(release|artist|track):([^\s[\]]+)\[((?:\\\]|[^\]])*)\]/g;

/** Match a skill invocation: /skill:id (id: word chars, digits, underscores) */
const SKILL_PATTERN = /\/skill:([A-Za-z][\w]*)/g;

function escapeLabel(label: string): string {
  return label.replaceAll(']', '\\]');
}

function unescapeLabel(label: string): string {
  return label.replaceAll('\\]', ']');
}

export function serializeEntity(
  mention: Omit<EntityMentionToken, 'type'>
): string {
  return `@${mention.kind}:${mention.id}[${escapeLabel(mention.label)}]`;
}

export function serializeSkill(id: string): string {
  return `/skill:${id}`;
}

/**
 * Parse a message string into ordered tokens. Text outside of mention/skill
 * patterns is preserved verbatim as TextToken. Empty text segments are dropped.
 */
export function parseTokens(input: string): ChatToken[] {
  if (!input) return [];

  interface Hit {
    readonly start: number;
    readonly end: number;
    readonly token: EntityMentionToken | SkillToken;
  }

  const hits: Hit[] = [];

  for (const match of input.matchAll(ENTITY_PATTERN)) {
    const [full, kind, id, label] = match;
    if (!ENTITY_KINDS.includes(kind as EntityKind)) continue;
    const start = match.index ?? 0;
    hits.push({
      start,
      end: start + full.length,
      token: {
        type: 'entity',
        kind: kind as EntityKind,
        id,
        label: unescapeLabel(label),
      },
    });
  }

  for (const match of input.matchAll(SKILL_PATTERN)) {
    const [full, id] = match;
    const start = match.index ?? 0;
    hits.push({
      start,
      end: start + full.length,
      token: { type: 'skill', id },
    });
  }

  hits.sort((a, b) => a.start - b.start);

  const tokens: ChatToken[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue; // overlap — drop later hit
    if (hit.start > cursor) {
      tokens.push({ type: 'text', value: input.slice(cursor, hit.start) });
    }
    tokens.push(hit.token);
    cursor = hit.end;
  }
  if (cursor < input.length) {
    tokens.push({ type: 'text', value: input.slice(cursor) });
  }

  return tokens.filter(t => t.type !== 'text' || t.value.length > 0);
}

/**
 * Render an ordered token array back to wire string. Roundtrips with parseTokens
 * (modulo dropped empty text segments).
 */
export function serializeTokens(tokens: readonly ChatToken[]): string {
  return tokens
    .map(t => {
      if (t.type === 'text') return t.value;
      if (t.type === 'skill') return serializeSkill(t.id);
      return serializeEntity(t);
    })
    .join('');
}

/** Extract all entity mentions from a message (for server-side resolution). */
export function extractEntities(input: string): EntityMentionToken[] {
  return parseTokens(input).filter(
    (t): t is EntityMentionToken => t.type === 'entity'
  );
}

/** Extract the first skill invocation from a message, if any. */
export function extractSkill(input: string): SkillToken | null {
  const found = parseTokens(input).find(
    (t): t is SkillToken => t.type === 'skill'
  );
  return found ?? null;
}
