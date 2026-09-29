import { createHash } from 'node:crypto';
import type {
  InvestorAnswerFirstLoopIssue,
  InvestorAnswerFirstLoopIssueCode,
  InvestorAnswerMaterialReceipt,
  InvestorFollowUp,
  InvestorQuestionRecord,
} from './answer-loop-certification-types';

export const SHA256 = /^sha256:[a-f0-9]{64}$/u;
export const PUBLIC_ARTICLE_PATH = /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const PRIVATE_MEMO_PATH =
  /^\/investor-portal\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export type StableValue =
  | string
  | number
  | boolean
  | null
  | readonly StableValue[]
  | { readonly [key: string]: StableValue };

function stableSerialize(value: StableValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function digest(value: StableValue): string {
  return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`;
}

export function time(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function add(
  issues: InvestorAnswerFirstLoopIssue[],
  code: InvestorAnswerFirstLoopIssueCode,
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}

export function questionSnapshot(
  question: InvestorQuestionRecord
): StableValue {
  return {
    capturedAt: question.capturedAt,
    classification: question.classification as unknown as StableValue,
    exactQuestion: question.exactQuestion,
    privateIdentityMarkers: question.privateIdentityMarkers,
    privacy: question.privacy,
    relationshipRef: question.relationshipRef,
    source: question.source as unknown as StableValue,
    tenantId: question.tenantId,
    untrustedContent: question.untrustedContent,
  };
}

export function deduplicateInvestorQuestions(
  records: readonly InvestorQuestionRecord[]
): {
  readonly records: readonly InvestorQuestionRecord[];
  readonly issues: readonly InvestorAnswerFirstLoopIssue[];
} {
  const unique = new Map<string, InvestorQuestionRecord>();
  const issues: InvestorAnswerFirstLoopIssue[] = [];

  for (const record of records) {
    const key = `${record.tenantId}\u0000${record.source.sourceType}\u0000${record.source.sourceEventId}`;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, record);
      continue;
    }
    if (
      digest(questionSnapshot(existing)) === digest(questionSnapshot(record))
    ) {
      continue;
    }
    add(
      issues,
      'question-conflict',
      `questionRecords.${record.questionId}`,
      'A source event was replayed with changed private question data.'
    );
  }

  return {
    records: [...unique.values()],
    issues,
  };
}

export function buildInvestorMaterialContentHash(
  material: InvestorAnswerMaterialReceipt
): string {
  return digest({
    answerId: material.answerId,
    answerVersion: material.answerVersion,
    artifactId: material.artifactId,
    content: material.content as unknown as StableValue,
    contentRevision: material.contentRevision,
    disclosure: material.disclosure,
    kind: material.kind,
    path: material.path,
  });
}

export function buildInvestorFollowUpSnapshotHash(
  followUp: InvestorFollowUp
): string {
  return digest({
    allowedAudience: followUp.allowedAudience,
    answerId: followUp.answerId,
    answerVersion: followUp.answerVersion,
    body: followUp.body,
    destination: followUp.destination,
    directAnswer: followUp.directAnswer,
    disclosure: followUp.disclosure,
    followUpId: followUp.followUpId,
    limits: followUp.limits,
    materialLinks: followUp.materialLinks,
    recipientRef: followUp.recipientRef,
    revision: followUp.revision,
    senderRef: followUp.senderRef,
  });
}
