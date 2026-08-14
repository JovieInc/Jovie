/**
 * High-recall merch person-content reviewer (JOV-4740).
 *
 * Reviews the candidate subject — user prompt, concept, fixture/vision labels,
 * and image description — not the generation contract boilerplate. Contract
 * lines such as "Do not depict people" are stripped so the prohibition cannot
 * be scored as a hit.
 */

import {
  MERCH_CONTENT_CONTRACT_VERSION,
  MERCH_CONTENT_MODE_GRAPHIC_ONLY,
  MERCH_CONTENT_REVIEWER_VERSION,
  type MerchContentReview,
  type MerchContentSubject,
  type MerchPersonContentFailureCode,
} from './content-contract';

interface PersonSignal {
  readonly code: MerchPersonContentFailureCode;
  readonly pattern: RegExp;
  readonly explicit: boolean;
}

const PERSON_SIGNALS: readonly PersonSignal[] = [
  {
    code: 'person.portrait',
    pattern: /\b(portraits?|selfies?)\b/g,
    explicit: true,
  },
  {
    code: 'person.face',
    pattern: /\b(faces?|facial)\b/g,
    explicit: true,
  },
  {
    code: 'person.human',
    pattern:
      /\b(people|persons?|humans?|man|men|woman|women|girl|girls|boy|boys|child|children|guy|guys)\b/g,
    explicit: true,
  },
  {
    code: 'person.body_part',
    pattern: /\b(hands?|fingers?|palms?|feet|torso|limbs?)\b/g,
    explicit: true,
  },
  {
    code: 'person.photoreal',
    pattern:
      /\bphotoreal(?:istic)?\s+(?:person|people|human|face|portrait|body|hand)/g,
    explicit: true,
  },
  {
    code: 'person.silhouette',
    pattern:
      /\b((?:human|person|people)[- ]like(?:\s+silhouettes?)?|(?:human|person)\s+silhouettes?)\b/g,
    explicit: true,
  },
  {
    code: 'person.implied',
    pattern: /\b(crowds?|audiences?|models?|runway|posing|posed)\b/g,
    explicit: false,
  },
];

const ANIMAL_MASCOT_PATTERN =
  /\b(mascots?|animals?|fox(?:es)?|wolves|wolf|cats?|kittens?|dogs?|puppies|bears?|tigers?|lions?|birds?|owls?|snakes?|dragons?|dinosaurs?|pandas?|sharks?|whales?|rabbits?|bunnies)\b/;

const CONTRACT_BOILERPLATE_PATTERN =
  /do not depict people[\s\S]*?human figures\.?|do not invent[\s\S]*?likeness\.?|no (?:fake )?(?:people|faces|portraits|models|human figures)[^.]*/gi;

const NEGATION_BEFORE_PATTERN =
  /(?:\bno\b|\bnot\b|\bnever\b|\bwithout\b|\bdon't\b|\bdo not\b|\bavoid\b|\bforbidden\b|\breject\b)\s+(?:any\s+|fake\s+)?$/i;

function normalizedHaystack(value: string): string {
  return value
    .replaceAll(CONTRACT_BOILERPLATE_PATTERN, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function subjectHaystack(subject: MerchContentSubject): string {
  return normalizedHaystack(
    [
      subject.prompt,
      subject.concept,
      subject.imageDescription,
      ...(subject.labels ?? []),
    ]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' \n ')
  );
}

function isNegatedMatch(haystack: string, index: number): boolean {
  const before = haystack.slice(Math.max(0, index - 48), index);
  return NEGATION_BEFORE_PATTERN.test(before);
}

function collectFailureCodes(
  haystack: string
): readonly MerchPersonContentFailureCode[] {
  if (!haystack) return [];

  const animalMascotContext = ANIMAL_MASCOT_PATTERN.test(haystack);
  const codes = new Set<MerchPersonContentFailureCode>();

  for (const signal of PERSON_SIGNALS) {
    signal.pattern.lastIndex = 0;
    for (const match of haystack.matchAll(signal.pattern)) {
      if (match.index === undefined) continue;
      if (isNegatedMatch(haystack, match.index)) continue;
      if (!signal.explicit && animalMascotContext) continue;
      codes.add(signal.code);
    }
  }

  return [...codes];
}

export function reviewMerchContent(
  subject: MerchContentSubject,
  now: Date = new Date()
): MerchContentReview {
  const failureCodes = collectFailureCodes(subjectHaystack(subject));
  const verdict = failureCodes.length > 0 ? 'reject' : 'pass';

  return {
    contractVersion: MERCH_CONTENT_CONTRACT_VERSION,
    reviewerVersion: MERCH_CONTENT_REVIEWER_VERSION,
    mode: MERCH_CONTENT_MODE_GRAPHIC_ONLY,
    verdict,
    failureCodes,
    confidence: failureCodes.length > 0 ? 0.95 : 0.8,
    reviewedAt: now.toISOString(),
  };
}

export function evaluateMerchCandidateReadiness(review: MerchContentReview): {
  readonly ready: boolean;
  readonly optionStatus: 'candidate' | 'rejected';
} {
  if (review.verdict === 'reject') {
    return { ready: false, optionStatus: 'rejected' };
  }
  return { ready: true, optionStatus: 'candidate' };
}
