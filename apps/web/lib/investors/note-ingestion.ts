import { z } from 'zod';

const gapClassificationSchema = z.enum([
  'communication',
  'evidence',
  'strategy',
  'investor-fit',
]);
const severitySchema = z.enum(['medium', 'high', 'critical']);
const signalKindSchema = z.enum(['question', 'objection']);

export const investorNoteSignalSchema = z.object({
  kind: signalKindSchema,
  text: z.string().trim().min(3).max(1000),
  gapClassification: gapClassificationSchema,
  severity: severitySchema,
  line: z.number().int().positive().optional(),
});

export const investorNoteInputSchema = z.object({
  source: z.object({
    kind: z.enum(['local-note', 'granola-export']),
    label: z.string().trim().min(1).max(200),
    capturedAt: z.iso.date(),
  }),
  transcript: z.string().max(100_000),
  signals: z.array(investorNoteSignalSchema).max(200),
});

export type InvestorNoteInput = z.infer<typeof investorNoteInputSchema>;
export type InvestorNoteSignal = z.infer<typeof investorNoteSignalSchema>;

export interface InvestorNoteCandidate {
  readonly key: string;
  readonly kind: InvestorNoteSignal['kind'];
  readonly text: string;
  readonly gapClassification: InvestorNoteSignal['gapClassification'];
  readonly severity: InvestorNoteSignal['severity'];
  readonly occurrenceCount: number;
  readonly frequency: 'occasional' | 'common' | 'frequent';
  readonly sources: readonly {
    readonly label: string;
    readonly capturedAt: string;
    readonly line?: number;
  }[];
}

export interface InvestorNoteReviewArtifact {
  readonly artifactVersion: '1.0.0';
  readonly reviewStatus: 'manual-review-required';
  readonly asOf: string;
  readonly sourceCount: number;
  readonly candidates: readonly InvestorNoteCandidate[];
  readonly classificationCounts: Readonly<
    Record<InvestorNoteSignal['gapClassification'], number>
  >;
  readonly guardrails: {
    readonly autoPublish: false;
    readonly protectedFields: readonly [
      'claims',
      'numbers',
      'ask',
      'positioning',
    ];
  };
  readonly recommendedReviewPath: string;
}

const ANNOTATED_LINE =
  /^(QUESTION|OBJECTION)\s*\|\s*(communication|evidence|strategy|investor-fit)\s*\|\s*(medium|high|critical)\s*\|\s*(.+)$/iu;
const severityRank = { medium: 0, high: 1, critical: 2 } as const;

function normalizeSignalText(text: string): string {
  return text
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function frequencyFor(count: number): InvestorNoteCandidate['frequency'] {
  if (count >= 4) return 'frequent';
  if (count >= 2) return 'common';
  return 'occasional';
}

/**
 * Deterministic manual-adapter format for plain-text exports:
 * QUESTION | evidence | high | What traction is proven?
 * OBJECTION | strategy | critical | The buyer is unclear.
 *
 * Unannotated transcript lines are retained as source context but never
 * interpreted as claims or objections.
 */
export function parseAnnotatedTranscript(
  transcript: string
): readonly InvestorNoteSignal[] {
  return transcript.split(/\r?\n/gu).flatMap((rawLine, index) => {
    const match = ANNOTATED_LINE.exec(rawLine.trim());
    if (!match) return [];
    const [, rawKind, gapClassification, severity, text] = match;
    return [
      investorNoteSignalSchema.parse({
        kind: rawKind?.toLocaleLowerCase('en-US'),
        text,
        gapClassification,
        severity,
        line: index + 1,
      }),
    ];
  });
}

export function buildInvestorNoteReviewArtifact(
  rawInputs: readonly unknown[]
): InvestorNoteReviewArtifact {
  const inputs = rawInputs.map(input => investorNoteInputSchema.parse(input));
  if (inputs.length === 0) {
    throw new Error('At least one investor note is required.');
  }

  const merged = new Map<
    string,
    {
      kind: InvestorNoteSignal['kind'];
      text: string;
      gapClassification: InvestorNoteSignal['gapClassification'];
      severity: InvestorNoteSignal['severity'];
      sources: Array<InvestorNoteCandidate['sources'][number]>;
    }
  >();

  for (const input of inputs) {
    for (const signal of input.signals) {
      const key = `${signal.kind}:${normalizeSignalText(signal.text)}`;
      const existing = merged.get(key);
      const source = {
        label: input.source.label,
        capturedAt: input.source.capturedAt,
        ...(signal.line ? { line: signal.line } : {}),
      };
      if (!existing) {
        merged.set(key, {
          kind: signal.kind,
          text: signal.text,
          gapClassification: signal.gapClassification,
          severity: signal.severity,
          sources: [source],
        });
        continue;
      }

      existing.sources.push(source);
      if (severityRank[signal.severity] > severityRank[existing.severity]) {
        existing.severity = signal.severity;
      }
    }
  }

  const candidates = [...merged.entries()]
    .map(
      ([key, value]): InvestorNoteCandidate => ({
        key,
        kind: value.kind,
        text: value.text,
        gapClassification: value.gapClassification,
        severity: value.severity,
        occurrenceCount: value.sources.length,
        frequency: frequencyFor(value.sources.length),
        sources: value.sources,
      })
    )
    .sort((left, right) =>
      severityRank[right.severity] !== severityRank[left.severity]
        ? severityRank[right.severity] - severityRank[left.severity]
        : right.occurrenceCount - left.occurrenceCount ||
          left.key.localeCompare(right.key)
    );

  const classificationCounts = {
    communication: 0,
    evidence: 0,
    strategy: 0,
    'investor-fit': 0,
  };
  for (const candidate of candidates) {
    classificationCounts[candidate.gapClassification] += 1;
  }

  return {
    artifactVersion: '1.0.0',
    reviewStatus: 'manual-review-required',
    asOf: inputs
      .map(input => input.source.capturedAt)
      .sort((left, right) => right.localeCompare(left))[0]!,
    sourceCount: inputs.length,
    candidates,
    classificationCounts,
    guardrails: {
      autoPublish: false,
      protectedFields: ['claims', 'numbers', 'ask', 'positioning'],
    },
    recommendedReviewPath:
      'Review candidates, then manually update fundraisingRegistry.risks in a dedicated PR. Do not copy transcript text into claims.',
  };
}
