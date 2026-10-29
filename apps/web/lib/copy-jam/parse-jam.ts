import type { CopyVerdict } from './verdicts';

/**
 * Parse a spoken copy jam ("HOME-3 sucks, too long. Home four great. S L two
 * meh, say it plainer.") into {id, verdict, note}. Deterministic first: spoken
 * ID matching, a verdict vocabulary, the words after the verdict as the note.
 * Anything it cannot settle comes back as a leftover for a small model.
 */

export interface ParsedVerdict {
  readonly copyId: string;
  readonly verdict: CopyVerdict;
  readonly note: string;
}

export interface JamLeftover {
  /** The spoken words after the ID mention, for the model to settle. */
  readonly segment: string;
  readonly copyIds: readonly string[];
  readonly reason: 'no-verdict' | 'unknown-id';
}

export interface JamParse {
  readonly verdicts: readonly ParsedVerdict[];
  readonly leftovers: readonly JamLeftover[];
}

/** Spoken names for ID prefixes. A prefix is always also spoken as itself. */
const PREFIX_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  PRICE: ['pricing', 'price'],
  AP: ['artist profiles', 'a p'],
  ARTP: ['artist profile'],
  SL: [
    'smart links',
    'smart link',
    'smartlinks',
    'smart lynx',
    'smartlynx',
    's l',
  ],
  CLAIM: ['claim'],
  WAIT: ['waitlist', 'wait list'],
  DL: ['download', 'd l'],
  CMP: ['compare'],
  ALT: ['alternatives'],
  INT: ['integrations'],
  SUP: ['support'],
  MERCH: ['merch', 'instant merch'],
  NOTIF: ['notifications', 'notif'],
  YT: ['youtube', 'y t'],
  DEV: ['developers', 'dev'],
  CHG: ['changelog'],
  ENG: ['engineering'],
  PROD: ['product'],
  SITE: ['site', 'header', 'footer', 'nav'],
  CLI: ['c l i', 'cli'],
  AI: ['a i'],
};

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
/** Transcription slips for a number straight after an ID prefix. */
const HOMOPHONES: Record<string, number> = { to: 2, too: 2, for: 4, won: 1 };

const VERDICT_PHRASES: ReadonlyArray<readonly [string, CopyVerdict]> = [
  ['not good', 'sucks'],
  ['no good', 'sucks'],
  ['not great', 'meh'],
  ['so so', 'meh'],
  ['needs work', 'meh'],
  ['could be better', 'meh'],
  ['ship it', 'great'],
  ['love it', 'great'],
  ['sucks', 'sucks'],
  ['suck', 'sucks'],
  ['sucked', 'sucks'],
  ['terrible', 'sucks'],
  ['awful', 'sucks'],
  ['bad', 'sucks'],
  ['trash', 'sucks'],
  ['garbage', 'sucks'],
  ['hate', 'sucks'],
  ['horrible', 'sucks'],
  ['cringe', 'sucks'],
  ['worse', 'sucks'],
  ['meh', 'meh'],
  ['okay', 'meh'],
  ['ok', 'meh'],
  ['fine', 'meh'],
  ['mid', 'meh'],
  ['mediocre', 'meh'],
  ['bland', 'meh'],
  ['average', 'meh'],
  ['great', 'great'],
  ['love', 'great'],
  ['loved', 'great'],
  ['perfect', 'great'],
  ['good', 'great'],
  ['nice', 'great'],
  ['amazing', 'great'],
  ['awesome', 'great'],
  ['excellent', 'great'],
  ['keep', 'great'],
  ['fire', 'great'],
  ['beautiful', 'great'],
];

const JOINERS = new Set(['and', 'also', 'plus', 'then', 'uh', 'um']);
const NOTE_LEAD = new Set([
  'and',
  'but',
  'so',
  'because',
  'its',
  "it's",
  'is',
  'are',
  'was',
]);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/(\d)-(\d)/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9' ,.;:!?]/g, ' ')
    .replace(/([,.;:!?])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);

const isPunct = (w: string) => /^[,.;:!?]$/.test(w);

/** Read a number at words[i]; returns [value, wordsUsed]. */
function readNumber(
  w: string[],
  i: number,
  allowHomophone: boolean
): [number, number] | null {
  const a = w[i];
  if (a === undefined) return null;
  if (/^\d{1,3}$/.test(a)) return [Number(a), 1];
  if (a in TENS) {
    const b = w[i + 1];
    if (b !== undefined && b in ONES && ONES[b]! >= 1 && ONES[b]! <= 9) {
      return [TENS[a]! + ONES[b]!, 2];
    }
    return [TENS[a]!, 1];
  }
  if (a in ONES) return [ONES[a]!, 1];
  if (allowHomophone && a in HOMOPHONES) return [HOMOPHONES[a]!, 1];
  return null;
}

function buildAliases(
  prefixes: readonly string[]
): Array<{ words: string[]; prefix: string }> {
  const out: Array<{ words: string[]; prefix: string }> = [];
  for (const prefix of prefixes) {
    const spoken = new Set<string>([
      prefix.toLowerCase(),
      prefix.toLowerCase().split('').join(' '),
    ]);
    for (const s of PREFIX_SYNONYMS[prefix] ?? []) spoken.add(s);
    for (const s of spoken) out.push({ words: s.split(' '), prefix });
  }
  return out.sort((a, b) => b.words.length - a.words.length);
}

interface Mention {
  readonly start: number;
  readonly end: number;
  readonly copyId: string;
  readonly known: boolean;
}

function findVerdict(
  seg: string[]
): { verdict: CopyVerdict; from: number; to: number } | null {
  for (let i = 0; i < seg.length; i += 1) {
    for (const [phrase, verdict] of VERDICT_PHRASES) {
      const p = phrase.split(' ');
      if (p.every((word, k) => seg[i + k] === word)) {
        return { verdict, from: i, to: i + p.length };
      }
    }
  }
  return null;
}

function cleanNote(seg: string[]): string {
  const kept = [...seg];
  while (
    kept.length &&
    (isPunct(kept[0]!) || NOTE_LEAD.has(kept[0]!) || JOINERS.has(kept[0]!))
  )
    kept.shift();
  while (
    kept.length &&
    (isPunct(kept[kept.length - 1]!) || JOINERS.has(kept[kept.length - 1]!))
  )
    kept.pop();
  return kept
    .join(' ')
    .replace(/ ([,.;:!?])/g, '$1')
    .replace(/[,.;:!?]+$/, '')
    .slice(0, 300);
}

export function parseJam(
  transcript: string,
  knownIds: ReadonlySet<string>
): JamParse {
  const w = words(transcript);
  const prefixes = [...new Set([...knownIds].map(id => id.split('-')[0]!))];
  const aliases = buildAliases(prefixes);

  const mentions: Mention[] = [];
  for (let i = 0; i < w.length; ) {
    let matched = false;
    for (const alias of aliases) {
      if (!alias.words.every((word, k) => w[i + k] === word)) continue;
      const at = i + alias.words.length;
      // "ok"/"mid" style words double as verdicts; require a number to follow.
      const num = readNumber(w, at, true);
      if (!num) continue;
      let end = at + num[1];
      const add = (n: number, e: number) => {
        const copyId = `${alias.prefix}-${n}`;
        mentions.push({
          start: i,
          end: e,
          copyId,
          known: knownIds.has(copyId),
        });
      };
      add(num[0], end);
      // "home 3 and 4": same prefix, more numbers.
      for (;;) {
        let j = end;
        if (isPunct(w[j] ?? '')) j += 1;
        if (!JOINERS.has(w[j] ?? '') && w[j - 1] !== ',') break;
        if (JOINERS.has(w[j] ?? '')) j += 1;
        const more = readNumber(w, j, false);
        if (!more) break;
        end = j + more[1];
        add(more[0], end);
      }
      i = end;
      matched = true;
      break;
    }
    if (!matched) i += 1;
  }

  // Group mentions with nothing but joiners between them: they share a verdict.
  const groups: Mention[][] = [];
  for (const m of mentions) {
    const prev = groups[groups.length - 1];
    const last = prev?.[prev.length - 1];
    const gap = last ? w.slice(last.end, m.start).filter(x => !isPunct(x)) : [];
    if (prev && last && gap.every(x => JOINERS.has(x))) prev.push(m);
    else groups.push([m]);
  }

  const verdicts: ParsedVerdict[] = [];
  const leftovers: JamLeftover[] = [];
  groups.forEach((group, gi) => {
    const last = group[group.length - 1]!;
    const nextStart = groups[gi + 1]?.[0]?.start ?? w.length;
    const seg = w.slice(last.end, nextStart);
    const unknown = group.filter(m => !m.known);
    const found = findVerdict(seg);
    if (unknown.length) {
      leftovers.push({
        segment: seg.join(' '),
        copyIds: unknown.map(m => m.copyId),
        reason: 'unknown-id',
      });
    }
    const known = group.filter(m => m.known);
    if (!known.length) return;
    if (!found) {
      leftovers.push({
        segment: seg.join(' '),
        copyIds: known.map(m => m.copyId),
        reason: 'no-verdict',
      });
      return;
    }
    const note = cleanNote([
      ...seg.slice(0, found.from),
      ...seg.slice(found.to),
    ]);
    for (const m of known)
      verdicts.push({ copyId: m.copyId, verdict: found.verdict, note });
  });
  return { verdicts, leftovers };
}
