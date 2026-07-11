import { createHash } from 'node:crypto';
import { z } from 'zod';

const GAP_CLASSIFICATIONS = [
  'communication',
  'evidence',
  'strategy',
  'investor-fit',
] as const;
const gapClassificationSchema = z.enum(GAP_CLASSIFICATIONS);
const severitySchema = z.enum(['medium', 'high', 'critical']);
const signalKindSchema = z.enum(['question', 'objection']);

export const investorNoteSignalSchema = z.object({
  kind: signalKindSchema,
  text: z.string().trim().min(1).max(1000),
  gapClassification: gapClassificationSchema,
  severity: severitySchema,
  line: z.number().int().positive().optional(),
});

export const investorNoteInputSchema = z.object({
  source: z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,127}$/u),
    kind: z.enum(['local-note', 'granola-export']),
    label: z.string().trim().min(1).max(200),
    capturedAt: z.iso.date(),
  }),
  transcript: z.string().max(100_000),
  signals: z.array(investorNoteSignalSchema).max(200),
});

export type InvestorNoteInput = z.infer<typeof investorNoteInputSchema>;
export type InvestorNoteSignal = z.infer<typeof investorNoteSignalSchema>;
type GapClassification = InvestorNoteSignal['gapClassification'];

export const investorNotePriorArtifactSchema = z.object({
  artifactVersion: z.literal('1.2.0'),
  reviewStatus: z.literal('manual-review-required'),
  corpus: z.array(
    z.object({
      source: investorNoteInputSchema.shape.source,
      transcriptSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      transcript: investorNoteInputSchema.shape.transcript,
      signals: investorNoteInputSchema.shape.signals,
    })
  ),
});

export function inputsFromPriorArtifact(
  raw: unknown
): readonly InvestorNoteInput[] {
  const artifact = investorNotePriorArtifactSchema.parse(raw);
  return artifact.corpus.map(entry => {
    if (transcriptHash(entry.transcript) !== entry.transcriptSha256) {
      throw new Error(
        `Prior artifact transcript hash mismatch for source ${entry.source.id}.`
      );
    }
    return {
      source: entry.source,
      transcript: entry.transcript,
      signals: entry.signals,
    };
  });
}

interface CandidateSource {
  readonly sourceId: string;
  readonly label: string;
  readonly capturedAt: string;
  readonly transcriptSha256: string;
  readonly line?: number;
}

export interface InvestorNoteCorpusEntry {
  readonly source: InvestorNoteInput['source'];
  readonly transcriptSha256: string;
  readonly transcript: string;
  readonly signals: readonly InvestorNoteSignal[];
}

export interface InvestorNoteCandidate {
  readonly key: string;
  readonly kind: InvestorNoteSignal['kind'];
  readonly text: string;
  readonly gapClassifications: readonly GapClassification[];
  readonly severity: InvestorNoteSignal['severity'];
  readonly occurrenceCount: number;
  readonly conversationCount: number;
  readonly frequency: 'occasional' | 'common' | 'frequent';
  readonly sources: readonly CandidateSource[];
  readonly proposedNextActions: readonly string[];
  readonly proposedReviewTargets: readonly string[];
}

export interface InvestorNoteReviewArtifact {
  readonly artifactVersion: '1.2.0';
  readonly reviewStatus: 'manual-review-required';
  readonly asOf: string;
  readonly sourceCount: number;
  readonly candidates: readonly InvestorNoteCandidate[];
  readonly corpus: readonly InvestorNoteCorpusEntry[];
  readonly classificationCounts: Readonly<Record<GapClassification, number>>;
  readonly proposedReviewTargets: readonly string[];
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
const compareText = (left: string, right: string) =>
  left.localeCompare(right, 'en-US');
const compareIsoDate = (left: string, right: string) =>
  Date.parse(left) - Date.parse(right);
const NEXT_ACTIONS: Readonly<Record<GapClassification, string>> = {
  communication:
    'Review whether the portal and deck explain the existing evidence clearly.',
  evidence:
    'Identify the missing source or measurement before changing investor-facing copy.',
  strategy: 'Resolve the company decision before proposing a narrative change.',
  'investor-fit':
    'Review targeting and outreach context before changing the canonical company story.',
};
const REVIEW_TARGETS: Readonly<Record<GapClassification, readonly string[]>> = {
  communication: ['portal', 'deck'],
  evidence: ['fundraisingRegistry.claims', 'portal', 'deck'],
  strategy: ['fundraisingRegistry.risks', 'portal', 'deck'],
  'investor-fit': ['outreach-brief', 'portal'],
};

export function normalizeSignalText(text: string): string {
  const normalized = text
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) throw new Error('Signal text has no letters or numbers.');
  return normalized;
}

function transcriptHash(transcript: string): string {
  return createHash('sha256').update(transcript, 'utf8').digest('hex');
}

function sourceRecordHash(input: InvestorNoteInput): string {
  return createHash('sha256')
    .update(JSON.stringify(input), 'utf8')
    .digest('hex');
}

function frequencyFor(count: number): InvestorNoteCandidate['frequency'] {
  if (count >= 4) return 'frequent';
  if (count >= 2) return 'common';
  return 'occasional';
}

function parseAnnotatedLine(
  rawLine: string
): Omit<InvestorNoteSignal, 'line'> | null {
  const match = ANNOTATED_LINE.exec(rawLine.trim());
  if (!match) return null;
  const [, rawKind, gapClassification, severity, text] = match;
  return investorNoteSignalSchema.omit({ line: true }).parse({
    kind: rawKind?.toLocaleLowerCase('en-US'),
    text,
    gapClassification,
    severity,
  });
}

export function parseAnnotatedTranscript(
  transcript: string
): readonly InvestorNoteSignal[] {
  return transcript.split(/\r?\n/gu).flatMap((rawLine, index) => {
    const signal = parseAnnotatedLine(rawLine);
    return signal ? [{ ...signal, line: index + 1 }] : [];
  });
}

function validateLineProvenance(
  input: InvestorNoteInput,
  signal: InvestorNoteSignal
): void {
  if (!signal.line) return;
  const rawLine = input.transcript.split(/\r?\n/gu)[signal.line - 1];
  const annotated = rawLine ? parseAnnotatedLine(rawLine) : null;
  if (
    !annotated ||
    annotated.kind !== signal.kind ||
    annotated.text !== signal.text ||
    annotated.gapClassification !== signal.gapClassification ||
    annotated.severity !== signal.severity
  ) {
    throw new Error(
      `Signal line ${signal.line} does not match annotated transcript content for source ${input.source.id}.`
    );
  }
}

export function buildInvestorNoteReviewArtifact(
  rawInputs: readonly unknown[]
): InvestorNoteReviewArtifact {
  const parsedInputs = rawInputs.map(input =>
    investorNoteInputSchema.parse(input)
  );
  const inputsById = new Map<string, InvestorNoteInput>();
  for (const input of parsedInputs) {
    const existing = inputsById.get(input.source.id);
    if (existing) {
      if (sourceRecordHash(existing) !== sourceRecordHash(input)) {
        throw new Error(
          `Investor note source ID ${input.source.id} has a changed source record.`
        );
      }
      continue;
    }
    inputsById.set(input.source.id, input);
  }
  const inputs = [...inputsById.values()].sort((left, right) =>
    compareText(left.source.id, right.source.id)
  );
  if (inputs.length === 0)
    throw new Error('At least one investor note is required.');

  const merged = new Map<
    string,
    {
      kind: InvestorNoteSignal['kind'];
      texts: Set<string>;
      classifications: Set<GapClassification>;
      severity: InvestorNoteSignal['severity'];
      occurrenceCount: number;
      conversationIds: Set<string>;
      sources: Map<string, CandidateSource>;
    }
  >();

  for (const input of inputs) {
    const sha256 = transcriptHash(input.transcript);
    for (const signal of input.signals) {
      validateLineProvenance(input, signal);
      const key = `${signal.kind}:${normalizeSignalText(signal.text)}`;
      const existing = merged.get(key) ?? {
        kind: signal.kind,
        texts: new Set<string>(),
        classifications: new Set<GapClassification>(),
        severity: signal.severity,
        occurrenceCount: 0,
        conversationIds: new Set<string>(),
        sources: new Map<string, CandidateSource>(),
      };
      existing.texts.add(signal.text);
      existing.classifications.add(signal.gapClassification);
      existing.occurrenceCount += 1;
      existing.conversationIds.add(input.source.id);
      if (severityRank[signal.severity] > severityRank[existing.severity]) {
        existing.severity = signal.severity;
      }
      const sourceKey = `${input.source.id}:${signal.line ?? 'manual'}`;
      existing.sources.set(sourceKey, {
        sourceId: input.source.id,
        label: input.source.label,
        capturedAt: input.source.capturedAt,
        transcriptSha256: sha256,
        ...(signal.line ? { line: signal.line } : {}),
      });
      merged.set(key, existing);
    }
  }

  const candidates = [...merged.entries()]
    .map(([key, value]): InvestorNoteCandidate => {
      const gapClassifications = GAP_CLASSIFICATIONS.filter(
        value.classifications.has.bind(value.classifications)
      );
      const proposedNextActions = gapClassifications.map(
        item => NEXT_ACTIONS[item]
      );
      const proposedReviewTargets = [
        ...new Set(gapClassifications.flatMap(item => REVIEW_TARGETS[item])),
      ].sort(compareText);
      const conversationCount = value.conversationIds.size;
      return {
        key,
        kind: value.kind,
        text: [...value.texts].sort(compareText)[0]!,
        gapClassifications,
        severity: value.severity,
        occurrenceCount: value.occurrenceCount,
        conversationCount,
        frequency: frequencyFor(conversationCount),
        sources: [...value.sources.values()].sort(
          (left, right) =>
            compareText(left.sourceId, right.sourceId) ||
            (left.line ?? 0) - (right.line ?? 0)
        ),
        proposedNextActions,
        proposedReviewTargets,
      };
    })
    .sort(
      (left, right) =>
        severityRank[right.severity] - severityRank[left.severity] ||
        right.conversationCount - left.conversationCount ||
        compareText(left.key, right.key)
    );

  const classificationCounts = Object.fromEntries(
    GAP_CLASSIFICATIONS.map(item => [
      item,
      candidates.filter(candidate =>
        candidate.gapClassifications.includes(item)
      ).length,
    ])
  ) as Record<GapClassification, number>;

  return {
    artifactVersion: '1.2.0',
    reviewStatus: 'manual-review-required',
    asOf: inputs
      .map(input => input.source.capturedAt)
      .sort(compareIsoDate)
      .at(-1)!,
    sourceCount: inputs.length,
    candidates,
    corpus: inputs.map(input => ({
      source: input.source,
      transcriptSha256: transcriptHash(input.transcript),
      transcript: input.transcript,
      signals: input.signals,
    })),
    classificationCounts,
    proposedReviewTargets: [
      ...new Set(candidates.flatMap(item => item.proposedReviewTargets)),
    ].sort(compareText),
    guardrails: {
      autoPublish: false,
      protectedFields: ['claims', 'numbers', 'ask', 'positioning'],
    },
    recommendedReviewPath:
      'Create codex/jov-3739-investor-note-review, update only source-backed registry risks or communication, run registry tests, and open a draft PR. Never copy transcript text into claims.',
  };
}
