import { z } from 'zod';
import { investorNotePriorArtifactSchema } from '@/lib/investors/note-ingestion';

const protectedFieldSchema = z.enum([
  'claims',
  'numbers',
  'ask',
  'positioning',
]);
const targetSchema = z.enum([
  'portal',
  'deck',
  'outreach-brief',
  'fundraisingRegistry.claims',
  'fundraisingRegistry.risks',
]);

export const investorReviewProposalSchema = z.object({
  proposalVersion: z.literal('1.0.0'),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/u),
  title: z.string().trim().min(1).max(120),
  approvedCandidates: z
    .array(
      z.object({
        key: z.string().min(1),
        proposedCopy: z.string().trim().min(1).max(2_000),
        action: z.string().trim().min(1).max(500),
        target: targetSchema,
        protectedFields: z.array(protectedFieldSchema),
        evidence: z
          .array(
            z.object({
              sourceId: z.string().min(1),
              transcriptSha256: z.string().regex(/^[a-f0-9]{64}$/u),
              line: z.number().int().positive().optional(),
            })
          )
          .min(1),
      })
    )
    .min(1),
});

export type InvestorReviewProposal = z.infer<
  typeof investorReviewProposalSchema
>;

export function renderInvestorReviewProposal(
  rawProposal: unknown,
  rawArtifact: unknown
): {
  readonly slug: string;
  readonly title: string;
  readonly markdown: string;
} {
  const proposal = investorReviewProposalSchema.parse(rawProposal);
  const artifact = investorNotePriorArtifactSchema
    .and(
      z.object({
        candidates: z.array(
          z.object({
            key: z.string(),
            proposedReviewTargets: z.array(z.string()),
            sources: z.array(
              z.object({
                sourceId: z.string(),
                transcriptSha256: z.string(),
                line: z.number().int().positive().optional(),
              })
            ),
          })
        ),
      })
    )
    .parse(rawArtifact);
  const candidates = new Map(
    artifact.candidates.map(candidate => [candidate.key, candidate])
  );

  const sections = [...proposal.approvedCandidates]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(item => {
      const candidate = candidates.get(item.key);
      if (!candidate)
        throw new Error(`Unknown approved candidate key: ${item.key}`);
      if (!candidate.proposedReviewTargets.includes(item.target)) {
        throw new Error(
          `Target ${item.target} is not allowed for ${item.key}.`
        );
      }
      for (const evidence of item.evidence) {
        const matches = candidate.sources.some(
          source =>
            source.sourceId === evidence.sourceId &&
            source.transcriptSha256 === evidence.transcriptSha256 &&
            source.line === evidence.line
        );
        if (!matches)
          throw new Error(`Evidence does not match candidate ${item.key}.`);
      }
      const flags =
        item.protectedFields.length > 0
          ? item.protectedFields.sort().join(', ')
          : 'none';
      const evidence = [...item.evidence]
        .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
        .map(
          ref =>
            `- \`${ref.sourceId}\` / \`${ref.transcriptSha256}\`${ref.line ? ` / line ${ref.line}` : ''}`
        )
        .join('\n');
      return `## ${item.key}\n\n- Target: \`${item.target}\`\n- Action: ${item.action}\n- Protected-field review: ${flags}\n\n### Proposed copy\n\n${item.proposedCopy}\n\n### Evidence\n\n${evidence}`;
    });

  return {
    slug: proposal.slug,
    title: proposal.title,
    markdown: `# ${proposal.title}\n\nStatus: **manual review required**\n\nThis artifact proposes copy only. It does not modify or approve investor-facing claims, numbers, the ask, or positioning.\n\n${sections.join('\n\n')}\n`,
  };
}
