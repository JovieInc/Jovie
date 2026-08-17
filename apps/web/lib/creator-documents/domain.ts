import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CreatorDocumentContent } from '@/lib/db/schema/creator-documents';

const ALLOWED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
]);
const ALLOWED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
]);
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const MAX_DOCUMENT_JSON_BYTES = 250_000;
const MAX_DOCUMENT_NODES = 5_000;
const MAX_DOCUMENT_DEPTH = 24;

export const creatorDocumentContentSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strict()
  .superRefine((document, context) => {
    if (
      Buffer.byteLength(JSON.stringify(document), 'utf8') >
      MAX_DOCUMENT_JSON_BYTES
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Document content is too large',
      });
      return;
    }

    let nodeCount = 0;
    const visit = (value: unknown, depth: number): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        context.addIssue({ code: 'custom', message: 'Invalid document node' });
        return;
      }
      if (depth > MAX_DOCUMENT_DEPTH || ++nodeCount > MAX_DOCUMENT_NODES) {
        context.addIssue({
          code: 'custom',
          message: 'Document structure is too complex',
        });
        return;
      }
      const node = value as Record<string, unknown>;
      if (typeof node.type !== 'string' || !ALLOWED_NODE_TYPES.has(node.type)) {
        context.addIssue({
          code: 'custom',
          message: 'Unsupported document node',
        });
        return;
      }
      if (node.type === 'text' && typeof node.text !== 'string') {
        context.addIssue({
          code: 'custom',
          message: 'Text nodes require text',
        });
      }
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks)) {
          context.addIssue({
            code: 'custom',
            message: 'Invalid document marks',
          });
        } else {
          for (const mark of node.marks) {
            const type =
              mark && typeof mark === 'object'
                ? (mark as Record<string, unknown>).type
                : null;
            if (typeof type !== 'string' || !ALLOWED_MARK_TYPES.has(type)) {
              context.addIssue({
                code: 'custom',
                message: 'Unsupported document mark',
              });
              continue;
            }
            if (type === 'link') {
              const attrs = (mark as Record<string, unknown>).attrs;
              const href =
                attrs && typeof attrs === 'object'
                  ? (attrs as Record<string, unknown>).href
                  : null;
              try {
                if (
                  typeof href !== 'string' ||
                  !SAFE_LINK_PROTOCOLS.has(new URL(href).protocol)
                ) {
                  throw new Error('Unsafe protocol');
                }
              } catch {
                context.addIssue({
                  code: 'custom',
                  message: 'Unsupported link target',
                });
              }
            }
          }
        }
      }
      if (node.content !== undefined) {
        if (!Array.isArray(node.content)) {
          context.addIssue({
            code: 'custom',
            message: 'Invalid nested document content',
          });
        } else {
          for (const child of node.content) visit(child, depth + 1);
        }
      }
    };

    for (const node of document.content ?? []) visit(node, 1);
  });

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
  plainText: z.string().max(100_000),
});

export type EvidenceClaim = {
  readonly kind: 'fact' | 'inference' | 'opinion' | 'anecdote';
  readonly evidenceState: 'supported' | 'contested' | 'unresolved';
  readonly sourceRecordId: string | null;
};

export function ideaContent(body: string): CreatorDocumentContent {
  return {
    type: 'doc',
    content: body
      .split(/\n{2,}/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
      .map(paragraph => ({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph }],
      })),
  };
}

export function hashRevision(input: {
  readonly title: string;
  readonly kind: string;
  readonly content: CreatorDocumentContent;
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
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
