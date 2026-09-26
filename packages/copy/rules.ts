/**
 * Canonical copy rules. Policy lives in canon/VOICE.md; this file is the only
 * executable copy of it. Other lints (apps/web/lib/chat/voice-lint.ts, the
 * marketing semantic auditor) consume these rules instead of keeping lists.
 *
 * Severity:
 *  - block: output cannot ship. Runtime callers must not send it; CI fails on
 *    new occurrences; the agent skill must rewrite.
 *  - warn:  fed to the judge panel and the rewrite loop, never ships silently
 *    on flagship copy, ignored on volume paths.
 */

export const COPY_REGISTERS = [
  'jovie-marketing', // jov.ie pages, ads, launch posts
  'jovie-product-ui', // in-app labels, empty/error states, onboarding
  'jovie-transactional', // lifecycle + support email/SMS sent as Jovie
  'jovie-persona', // Jovie the character: chat, social captions
  'founder-tim', // anything sent in Tim's name
  'customer-voice', // written on behalf of a customer, in their voice
] as const;
export type CopyRegister = (typeof COPY_REGISTERS)[number];

/** Registers that speak as Jovie the company. House style applies in full. */
export const JOVIE_REGISTERS: readonly CopyRegister[] = [
  'jovie-marketing',
  'jovie-product-ui',
  'jovie-transactional',
  'jovie-persona',
];

export type CopySeverity = 'block' | 'warn';

export type CopyCategory =
  | 'harm' // abuse, threats, harassment, self-harm encouragement
  | 'legal' // guarantees, income claims, fake scarcity, unsubstantiated superlatives
  | 'platform' // DSP / social ToS violations (artificial streams, bought followers)
  | 'privacy' // secrets and credentials
  | 'leak' // model/meta/template residue
  | 'negativity' // contempt for customers, fans, or other people
  | 'slop' // AI-writing tells
  | 'format' // punctuation and typography house rules
  | 'clarity' // hedging, vagueness, bloat
  | 'truth'; // product-specific overclaims

export interface CopyRule {
  readonly id: string;
  readonly category: CopyCategory;
  readonly severity: CopySeverity;
  /** 'all' = universal floor, including customer-voice. */
  readonly registers: 'all' | readonly CopyRegister[];
  readonly pattern: RegExp;
  readonly message: string;
  /** Registers where a block rule only warns. */
  readonly warnIn?: readonly CopyRegister[];
  /** Only applies when the text is a heading. */
  readonly headlineOnly?: boolean;
}

const words = (list: readonly string[]) =>
  new RegExp(`\\b(?:${list.join('|')})\\b`, 'i');

const NOT_FOUNDER_OR_CUSTOMER: readonly CopyRegister[] = [...JOVIE_REGISTERS];

export const COPY_RULES: readonly CopyRule[] = [
  // ── Universal floor: harm, legal, platform, privacy, leak ──────────────
  {
    id: 'directed-abuse',
    category: 'harm',
    severity: 'block',
    registers: 'all',
    pattern:
      /\b(?:you(?:'re| are)|ur|u r)\s+(?:an?\s+|such an?\s+|so\s+)?(?:idiot|moron|stupid|worthless|pathetic|loser|trash|garbage|retard(?:ed)?|dumb(?:ass)?)\b|\bfuck\s+(?:you|off|u)\b|\bshut\s+the\s+fuck\s+up\b/i,
    message:
      'Insults or profanity aimed at a person. Swearing for emphasis is fine in founder voice; aiming it at someone is not.',
  },
  {
    id: 'threat-or-self-harm',
    category: 'harm',
    severity: 'block',
    registers: 'all',
    pattern:
      /\b(?:kill|hurt|destroy)\s+(?:yourself|you)\b|\bkys\b|\byou(?:'ll| will)\s+regret\b|\bi know where you live\b/i,
    message: 'Threat, intimidation, or self-harm language.',
  },
  {
    id: 'guaranteed-results',
    category: 'legal',
    severity: 'block',
    registers: 'all',
    pattern:
      /\bguarantee(?:d|s)?\b[^.!?\n]{0,40}\b(?:streams?|followers?|fans?|growth|results?|income|revenue|placements?|playlists?|virality|viral|sales|success)\b|\b(?:streams?|followers?|results?|growth|income)\b[^.!?\n]{0,20}\bguaranteed\b/i,
    message:
      'Outcome guarantees are false-advertising risk. State what the product does, not what it guarantees.',
  },
  {
    id: 'income-claim',
    category: 'legal',
    severity: 'block',
    registers: 'all',
    pattern:
      /\b(?:make|earn|making|earning)\s+\$?\d[\d,.]*k?\s*(?:\+\s*)?(?:dollars\s+)?(?:a|per|every)\s+(?:day|week|month|year)\b|\bget rich\b|\bpassive income\b/i,
    message: 'Earnings claims need substantiation and disclaimers. Cut them.',
  },
  {
    id: 'risk-free',
    category: 'legal',
    severity: 'block',
    registers: 'all',
    pattern: /\b(?:risk[- ]free|no risk|100% (?:safe|secure|guaranteed))\b/i,
    message: 'Absolute safety claims are unverifiable.',
  },
  {
    id: 'fake-scarcity',
    category: 'legal',
    severity: 'block',
    registers: 'all',
    pattern:
      /\bonly\s+\d+\s+(?:spots?|seats?|places?|invites?)\s+(?:left|remaining)\b|\b(?:offer|deal|price)\s+ends\s+(?:tonight|today|in\s+\d+\s+(?:hours?|minutes?))\b|\bact now\b|\blast chance\b/i,
    message:
      'Manufactured urgency. Real deadlines belong in the offer source, not the copy.',
  },
  {
    id: 'unsubstantiated-superlative',
    category: 'legal',
    severity: 'block',
    registers: 'all',
    pattern:
      /(?:(?<![\w&])#1(?![0-9a-fA-F])|\bnumber one|\bworld'?s (?:best|first|leading)|\bthe (?:best|only|leading|fastest|most powerful)\b[^.!?\n]{0,30}\b(?:in the world|on the (?:market|planet)|ever made|in the industry))/i,
    message:
      'Comparative superlatives need a cited, current source. Say the specific thing instead.',
  },
  {
    id: 'artificial-engagement',
    category: 'platform',
    severity: 'block',
    registers: 'all',
    pattern:
      /\b(?:buy|buying|purchase|boost)\s+(?:real\s+)?(?:streams|plays|followers|likes|views|monthly listeners)\b|\b(?:stream|streaming|click)\s+farms?\b|\bbot(?:ted)?\s+(?:streams|plays|followers)\b|\bplaylist\s+placement\s+for\s+\$/i,
    message:
      'Artificial streaming and bought engagement violate DSP and social platform terms.',
  },
  {
    id: 'secret-material',
    category: 'privacy',
    severity: 'block',
    registers: 'all',
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bpassword\s*[:=]\s*\S+/i,
    message: 'Credential or secret in customer-facing text.',
  },
  {
    id: 'model-residue',
    category: 'leak',
    severity: 'block',
    registers: 'all',
    pattern:
      /\bas an ai(?: language model)?\b|\bi(?:'d| would) be (?:happy|glad) to help\b|\bcertainly!|\bgreat question\b|\bi hope this (?:email|message|note) finds you well\b|\bi apologi[sz]e for (?:any|the) confusion\b|\bhere(?:'s| is) (?:a|the|your) (?:revised|rewritten|polished|improved)\b|\boption [abc]:|\bi cannot assist\b/i,
    message: 'Chatbot residue. The reader should never see the model.',
  },
  {
    id: 'template-residue',
    category: 'leak',
    severity: 'block',
    registers: 'all',
    pattern:
      /\[(?:insert|your|name|company|placeholder)[^\]]*\]|\{\{\s*[\w.]+\s*\}\}|\blorem ipsum\b|\bTODO\b|\bTBD\b|\bXX+\b/i,
    message: 'Unfilled template slot or placeholder.',
  },
  {
    id: 'contempt-for-people',
    category: 'negativity',
    severity: 'block',
    registers: 'all',
    pattern:
      /\b(?:users?|customers?|fans?|artists?|listeners?|people|clients?|investors?)\s+(?:are|is)\s+(?:so\s+)?(?:dumb|stupid|idiots?|morons?|lazy|clueless|sheep|trash)\b|\b(?:scam|garbage|trash)\s+(?:company|companies|platform|app)\b/i,
    message:
      'Contempt for customers, fans, or other businesses. Show the better way instead.',
  },

  {
    id: 'brand-frame',
    category: 'negativity',
    severity: 'block',
    registers: ['founder-tim', 'jovie-persona', 'jovie-marketing'],
    // Ops voice guard: never mirror someone's failure onto Tim or Jovie, never
    // claim unverified shared suffering, never frame the company as behind.
    pattern:
      /\b(?:been there|i know (?:exactly )?how that feels|i(?:'ve| have) struggled with (?:that|this)|we(?:'ve| have) all been (?:there|through (?:it|that))|i used to think that way|fingers crossed|wish (?:me|us) luck|playing catch[- ]up|still catching up|we(?:'re| are) behind|(?:so )?grateful (?:anyone|someone|you) (?:gave|took a chance)|can'?t believe (?:anyone|you) (?:gave|took))\b/i,
    message:
      'Harms the brand frame: mirrors a negative, claims unverified shared experience, or frames Tim or Jovie as behind or lucky. Reframe toward the useful insight.',
  },

  // ── Slop tells (Jovie + founder; customer-voice gets the dash rule only) ─
  {
    id: 'em-dash',
    category: 'slop',
    severity: 'block',
    registers: 'all',
    pattern: /[—–]|\s--\s/,
    message: 'No em or en dashes. Use a period, comma, or colon.',
  },
  {
    id: 'negative-parallelism',
    category: 'slop',
    severity: 'block',
    registers: [...NOT_FOUNDER_OR_CUSTOMER, 'founder-tim'],
    pattern:
      /\b(?:it|this|that)(?:'s not|\s+is not|\s+isn'?t|\s+was not|\s+wasn'?t)\s+(?:just\s+|only\s+|merely\s+)?(?:about\s+)?[^.,;:!?\n]{1,40}[,;:.]\s*(?:it|this|that)(?:'s|\s+is|\s+was)\b|\bnot (?:just |only |merely )?(?:a|an|the|about) [^.,;:\n]{1,30}[,;]? but (?:a|an|the|about)\b/i,
    message: '"It\'s not X, it\'s Y." Say the point directly.',
  },
  {
    id: 'banned-phrase',
    category: 'slop',
    severity: 'block',
    registers: [...NOT_FOUNDER_OR_CUSTOMER, 'founder-tim'],
    pattern:
      /\b(?:excited to (?:share|announce)|thrilled to (?:announce|share)|let that sink in|read that again|here'?s the (?:truth|thing|kicker|deal)|here'?s why\b|at the end of the day|let me (?:tell you|be clear)|to be clear|make no mistake|i'?ve been thinking about|game[- ]?changer|game[- ]changing|move the needle|unlock (?:your|the) (?:full )?potential|in today'?s (?:fast-paced|digital|ever-changing)|spoiler alert|plot twist|the punchline|fire\.?\s+that'?s the play|catch you on the flip side|totally dark|probably goes nowhere(?:\s+useful)?|without further ado|buckle up|dive (?:in|into)|deep dive)\b/i,
    message: 'Stock AI phrase. Delete it and start with the point.',
  },
  {
    id: 'corporate-verb',
    category: 'slop',
    severity: 'block',
    registers: [...NOT_FOUNDER_OR_CUSTOMER, 'founder-tim'],
    pattern: words([
      'leverage[sd]?',
      'leveraging',
      'robust',
      'delve[sd]?',
      'delving',
      'showcase[sd]?',
      'intricate',
      'vibrant',
      'tapestry',
      'underscores?',
      'foster(?:s|ing)?',
      'comprehensive',
      'nuanced',
      'multifaceted',
      'pivotal',
      'elevate[sd]?',
      'empower(?:s|ing|ed)?',
      'seamless(?:ly)?',
      'synerg(?:y|ies|ize)',
      'paradigm',
      'revolutioni[sz]e[sd]?',
      'cutting[- ]edge',
      'best[- ]in[- ]class',
      'world[- ]class',
      'next[- ]level',
      'holistic',
      'transformative',
      'ever[- ]evolving',
      'testament to',
      'in the realm of',
      'navigat(?:e|ing) the (?:landscape|complexities)',
      'embark(?:s|ed|ing)? on',
      'supercharge[sd]?',
      'harness(?:es|ing)? the power',
      'innovative',
      'disruptive',
      'ecosystem',
    ]),
    message:
      'Corporate or AI-flavored vocabulary. Use the plain word or the specific fact.',
  },
  {
    id: 'style-as-outcome',
    category: 'slop',
    severity: 'block',
    registers: ['jovie-marketing', 'jovie-product-ui'],
    pattern:
      /\b(?:a|an|the)\s+(?:modern|elegant|sleek|beautiful|stunning|premium|intuitive)(?:,?\s+(?:and\s+)?(?:modern|elegant|sleek|beautiful|stunning|premium|intuitive|seamless))+\s+(?:experience|platform|solution|way|tool)\b|\b(?:experience|solution)\s+(?:like never before|you deserve)\b/i,
    message:
      'Style adjectives standing in for an outcome. Say what the customer can now do.',
  },
  {
    id: 'cheerleading',
    category: 'slop',
    severity: 'block',
    registers: JOVIE_REGISTERS,
    pattern:
      /\b(?:amazing|awesome journey|super excited|can'?t wait|superstar|rockstar|crushing it|let'?s gooo+)\b/i,
    message: 'Cheerleading instead of information.',
  },

  {
    id: 'marketing-hype',
    category: 'slop',
    severity: 'block',
    registers: ['jovie-marketing'],
    pattern:
      /\b(?:unlock(?:s|ed|ing)?|reimagin(?:e|es|ed|ing)|all-in-one|one-stop shop)\b/i,
    message:
      'Generic promotion. Replace with a concrete action or consequence.',
  },
  {
    id: 'ai-transition',
    category: 'slop',
    severity: 'block',
    registers: [...NOT_FOUNDER_OR_CUSTOMER, 'founder-tim'],
    warnIn: [
      'jovie-product-ui',
      'jovie-transactional',
      'jovie-persona',
      'founder-tim',
    ],
    pattern:
      /\b(?:furthermore|moreover|additionally|crucial(?:ly)?|interplay|landscape|fundamental(?:ly)?)\b/i,
    message:
      'Stock model transition or vocabulary. Use a plain word or cut it.',
  },
  {
    id: 'formulaic-contrast',
    category: 'slop',
    severity: 'block',
    registers: [...NOT_FOUNDER_OR_CUSTOMER, 'founder-tim'],
    pattern: /\b(?:not|more than) (?:just|only|merely)\b/i,
    message: 'Stock contrast. State the stronger idea directly.',
  },
  {
    id: 'formulaic-range',
    category: 'slop',
    severity: 'block',
    registers: ['jovie-marketing'],
    pattern: /\bfrom [^.!?\n]{1,60} to\b/i,
    message: 'Generic from-X-to-Y frame. Name the exact moments.',
  },
  {
    id: 'artifact-language',
    category: 'truth',
    severity: 'block',
    registers: ['jovie-marketing'],
    pattern:
      /\b(?:mockups?|concept renders?|registry-backed|captured from|annotated|design artifact)\b/i,
    message: 'Sell the product outcome, never the marketing artifact.',
  },
  {
    id: 'generic-heading',
    category: 'slop',
    severity: 'block',
    registers: ['jovie-marketing'],
    headlineOnly: true,
    pattern: /^(?:built|designed|made) (?:for|to|around)\b/i,
    message: 'Lead with the customer consequence, not a generic construction.',
  },
  {
    id: 'rhetorical-heading',
    category: 'slop',
    severity: 'block',
    registers: ['jovie-marketing'],
    headlineOnly: true,
    pattern: /\?\s*$/,
    message: 'Answer the question in the heading instead of asking it.',
  },

  // ── Format ─────────────────────────────────────────────────────────────
  {
    id: 'multi-exclamation',
    category: 'format',
    severity: 'block',
    registers: 'all',
    pattern: /!{2,}|[!?]{3,}/,
    message: 'Stacked punctuation.',
  },
  {
    id: 'emoji',
    category: 'format',
    severity: 'block',
    registers: JOVIE_REGISTERS,
    pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u,
    message: 'No emoji when speaking as Jovie.',
  },
  {
    id: 'shouting',
    category: 'format',
    severity: 'block',
    registers: JOVIE_REGISTERS,
    // 4+ letter all-caps word. Initialisms artists and product UI actually use are allowed.
    pattern:
      /\b(?!(?:ISRC|UPC|FOMO|DSPs?|IRPAA|HTML|JSON|HTTP|HTTPS|API|APIs|CSV|FAQ|OAUTH|SMS|MIDI|WAV|FLAC|AIFF|NASA|NCAA|TIDAL|ASCAP|SESAC|IPRS|PRS|SOCAN|GEMA|SACEM|JASRAC|BMI|RIAA|IFPI|UMG|NYC|LGBTQ|EPKs?|USD|EUR|GBP|PDF|JPEG|HEIC|MPEG|WEBP|YAML|UUID|OTP)\b)[A-Z]{4,}\b/,
    message: 'All-caps shouting.',
  },

  // ── Clarity (house style) ──────────────────────────────────────────────
  {
    id: 'hedging',
    category: 'clarity',
    severity: 'block',
    registers: ['jovie-persona', 'jovie-marketing'],
    warnIn: ['jovie-marketing'],
    pattern:
      /\b(?:might|maybe|perhaps|i think|i believe|it seems like|arguably|it could be argued)\b/i,
    message: 'Hedging. State it or cut it.',
  },
  {
    id: 'apology',
    category: 'clarity',
    severity: 'block',
    registers: ['jovie-persona'],
    pattern: /\b(?:sorry|apologies|apologize|my bad)\b/i,
    message:
      'Jovie fixes, it does not grovel. Say what happened and what to do next.',
  },
  {
    id: 'vague-quantifier',
    category: 'clarity',
    severity: 'block',
    registers: JOVIE_REGISTERS,
    warnIn: ['jovie-marketing', 'jovie-product-ui', 'jovie-transactional'],
    pattern:
      /\b(?:a lot of|tons of|countless|so many|many people|studies show|experts say|many believe|industry leaders)\b/i,
    message: 'Vague quantity. Use the number or cut it.',
  },
  {
    id: 'filler',
    category: 'clarity',
    severity: 'warn',
    registers: JOVIE_REGISTERS,
    pattern:
      /\b(?:in order to|at this point in time|due to the fact that|it is important to note|please note that|basically|essentially|actually|really|very|simply|just)\b/i,
    message: 'Filler. Cut the word and reread.',
  },

  // ── Product truth (registered overclaims) ──────────────────────────────
  {
    id: 'premature-ownership',
    category: 'truth',
    severity: 'block',
    registers: JOVIE_REGISTERS,
    pattern:
      /\b(?:your live profile|profile is live|you'?re all set as the owner|claimed your profile)\b/i,
    message: 'Claims ownership or publication before claim and verification.',
  },
  {
    id: 'unsupported-audience-claim',
    category: 'truth',
    severity: 'block',
    registers: 'all',
    pattern:
      /\b(?:notify (?:all(?: your)?|your entire|the whole) (?:spotify )?followers|reach (?:all(?: your)?|your entire) (?:spotify )?followers|tells? (?:all )?your fans without you doing anything)\b/i,
    message:
      'Jovie cannot message a DSP audience. Only permissioned subscribers.',
  },
];

/** Soft structural limits by register. Exceeding them warns; the judge decides. */
export const COPY_BUDGETS: Readonly<
  Record<CopyRegister, { maxSentenceWords: number; maxExclamations: number }>
> = {
  'jovie-marketing': { maxSentenceWords: 22, maxExclamations: 0 },
  'jovie-product-ui': { maxSentenceWords: 18, maxExclamations: 0 },
  'jovie-transactional': { maxSentenceWords: 24, maxExclamations: 1 },
  'jovie-persona': { maxSentenceWords: 24, maxExclamations: 1 },
  'founder-tim': { maxSentenceWords: 32, maxExclamations: 1 },
  'customer-voice': { maxSentenceWords: 40, maxExclamations: 3 },
};
