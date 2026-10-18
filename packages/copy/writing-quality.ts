export const WRITING_QUALITY_SCHEMA = 'jev-writing-quality/v1';
export const WRITING_QUALITY_RUBRIC_VERSION = '2026-10-15.1';
export const MAX_PASSAGES = 16;

/** Per-axis rubrics. Versioned together; Jev answers choices, never prose. */
export const WRITING_QUALITY_RUBRICS = Object.freeze({
  'claim-support': {
    version: '2026-10-15.1',
    question:
      'Does every claim have direct support in both allowedClaims and evidence? Check numbers, quantities, dates, entities, promises, constraints, ownership, polarity and uncertainty, including contradictions and implications across sentences or passages. The prior draft and approved voice examples are not factual evidence: an unsupported original claim never becomes an allowed fact. Missing or ambiguous support requires insufficient-evidence; contradicted or invented facts require violation.',
  },
  'task-completion': {
    version: '2026-09-26.1',
    question:
      'Does this passage do its intended job for the declared audience and purpose, as recorded in the contract?',
  },
  'empty-praise': {
    version: '2026-09-26.1',
    question:
      'Does this passage contain praise, hype, or puffery that carries no concrete information for the reader?',
  },
  repetition: {
    version: '2026-09-26.1',
    question:
      'Does this passage unnecessarily repeat a point already made elsewhere in the candidate without adding information?',
  },
  'instruction-leakage': {
    version: '2026-09-26.1',
    question:
      'Does this passage leak model, template, prompt, or instruction residue the reader should never see?',
  },
  'voice-fit': {
    version: '2026-10-15.1',
    question:
      'Does this passage fit the declared voice for this surface, compared against approvedVoiceExamples? Preserve deliberate fragments, domain terms, exact quotations, non-English text and evidence-justified uncertainty. For contextualStyleFindings, distinguish justified uncertainty, approved domain usage and initialisms from generic hedging, corporate bloat and shouting. Context cannot waive safety, privacy, legal, platform, truth or instruction-leakage findings.',
  },
  'revision-fidelity': {
    version: '2026-10-15.1',
    question:
      'Compared with priorDraft, does the candidate preserve supported facts and protected meaning throughout the whole message? Check changed numbers, quantities, dates, entities, promises, omitted or negated constraints, altered ownership, polarity, stronger certainty and cross-sentence drift. Preserve quoted material exactly, including punctuation and whitespace, approved voice, deliberate fragments, domain terms, justified uncertainty and non-English text. Removing an unsupported original claim is valid; repeating it does not establish truth. Lexical equality alone cannot establish semantic fidelity. Judge original claims against allowedClaims and evidence; missing or ambiguous evidence requires insufficient-evidence.',
  },
});

export const WRITING_QUALITY_AXES = Object.freeze(
  Object.keys(WRITING_QUALITY_RUBRICS)
);

/**
 * Per-axis calibrated minimum confidence (JOV-6476). An axis without a
 * calibrated value abstains — there is no universal threshold and no
 * compensating overall score. Provisional until holdout evidence lands.
 */
export const WRITING_QUALITY_CALIBRATION = Object.freeze({
  version: 'provisional-2026-09-26',
  source: 'JOV-6476 holdout pending; axes absent here abstain',
  minConfidence: Object.freeze({
    'claim-support': 0.6,
    'task-completion': 0.6,
    'empty-praise': 0.5,
    repetition: 0.5,
    'instruction-leakage': 0.5,
    'voice-fit': 0.7,
    'revision-fidelity': 0.7,
  }),
});

export type WritingQualityAxis = keyof typeof WRITING_QUALITY_RUBRICS;

/**
 * Segment candidate text into code-assigned passage IDs. Boundaries are
 * deterministic (blank lines, then sentence groups); the model can only
 * reference IDs this function minted.
 */
export function segmentPassages(text: string) {
  if (typeof text !== 'string' || !text.trim())
    throw new Error('candidate text required');
  const blocks = text
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);
  const passages = [];
  for (const block of blocks) {
    if (block.length <= 1200) {
      passages.push(block);
      continue;
    }
    // Keep the original whitespace, including inside quotations.
    const sentences = block.split(/(?<=[.!?])(?=\s)/).filter(Boolean);
    let current = '';
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > 1200) {
        passages.push(current);
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current) passages.push(current);
  }
  if (!passages.length || passages.length > MAX_PASSAGES)
    throw new Error(`candidate must segment into 1..${MAX_PASSAGES} passages`);
  return Object.freeze(
    passages.map((text, i) => Object.freeze({ id: `p${i + 1}`, text }))
  );
}
