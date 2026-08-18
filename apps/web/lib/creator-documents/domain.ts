import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CreatorDocumentContent } from '@/lib/db/schema/creator-documents';
import {
  plainTextToRichTextDocument,
  richTextDocumentSchema,
} from '@/lib/rich-text/document';

export const creatorDocumentContentSchema = richTextDocumentSchema;

export const saveIdeaInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(100_000),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const saveRevisionInputSchema = z.object({
  documentId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  kind: z.enum(['idea', 'research', 'script']),
  content: creatorDocumentContentSchema,
});

export type EvidenceClaim = {
  readonly kind: 'fact' | 'inference' | 'opinion' | 'anecdote';
  readonly evidenceState: 'supported' | 'contested' | 'unresolved';
  readonly sourceRecordId: string | null;
};

export function ideaContent(body: string): CreatorDocumentContent {
  return plainTextToRichTextDocument(body);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError('Revision content must be JSON serializable');
    }
    return serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      key => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`
    )
    .join(',')}}`;
}

export function hashRevision(input: {
  readonly title: string;
  readonly kind: string;
  readonly content: CreatorDocumentContent;
}): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

export function assertScriptCanBeApproved(claims: readonly EvidenceClaim[]) {
  const unsupportedFact = claims.find(
    claim =>
      claim.kind === 'fact' &&
      (claim.evidenceState !== 'supported' || !claim.sourceRecordId)
  );
  if (unsupportedFact) {
    throw new Error('Every factual script claim needs supporting evidence');
  }
}

export function nextRevision(expectedRevision: number): number {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error('Expected revision must be a positive integer');
  }
  return expectedRevision + 1;
}
