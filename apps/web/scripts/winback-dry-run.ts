#!/usr/bin/env tsx
/**
 * Win-back dry run (founder dispatch 2026-11-09) — READ-ONLY report.
 *
 *   pnpm --filter @jovie/web exec tsx scripts/winback-dry-run.ts \
 *     --capability <feature-id> [--mark-run]
 *
 * For the given capability key it reports:
 * - capabilities newly shipped+certified since the last run (FEATURE_REGISTRY.md
 *   parsed against the certified-capabilities ledger and the run watermark);
 * - who would be drafted: COUNTS plus ANONYMIZED ids only (first 8 chars of
 *   the entry id). No emails, no handles, no wants text — no PII in logs.
 *
 * `--mark-run` advances the watermark after printing; without it the run
 * leaves all state untouched.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { db } from '@/lib/db';
import {
  diffNewlyShippedCertifiedCapabilities,
  WINBACK_MATCHABLE_STATUSES,
} from '@/lib/waitlist/winback';
import { matchWinbackCandidates } from '@/lib/waitlist/winback.server';
import {
  getCertifiedCapabilityKeys,
  getWinbackShippedWatermark,
  markWinbackShippedWatermark,
} from '@/lib/waitlist/winback-signals.server';

function anonymizeId(id: string): string {
  return id.slice(0, 8);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      capability: { type: 'string' },
      'mark-run': { type: 'boolean', default: false },
    },
  });

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const registryPath = resolve(
    join(scriptDir, '../../../docs/FEATURE_REGISTRY.md')
  );
  const registryMarkdown = readFileSync(registryPath, 'utf8');

  const now = new Date();
  const [certifiedKeys, watermark] = await Promise.all([
    getCertifiedCapabilityKeys(db),
    getWinbackShippedWatermark(db),
  ]);

  const diff = diffNewlyShippedCertifiedCapabilities({
    registryMarkdown,
    certifiedKeys,
    previousKeys: watermark?.keys ?? null,
  });

  const report: Record<string, unknown> = {
    generatedAt: now.toISOString(),
    statusesConsidered: [...WINBACK_MATCHABLE_STATUSES],
    shippedAndCertifiedCount: diff.currentKeys.length,
    newlyShippedAndCertified: diff.newlyAvailable,
    watermark: {
      previousCheckedAt: watermark?.checkedAt ?? null,
      previousKeys: watermark?.keys.length ?? 0,
    },
    dryRun: null as unknown,
  };

  if (values.capability) {
    const match = await matchWinbackCandidates(db, values.capability, {
      now,
    });
    const drafted = match.candidates.filter(
      candidate =>
        candidate.qualification.verdict === 'ELIGIBLE' && candidate.handle
    );
    report.dryRun = {
      capabilityKey: match.capabilityKey,
      seam: match.seam,
      seamDetail: match.seamDetail,
      candidateCount: match.candidates.length,
      draftableCount: drafted.length,
      anonymizedDraftableIds: drafted.map(candidate =>
        anonymizeId(candidate.entryId)
      ),
      qualificationVerdicts: match.candidates.reduce<Record<string, number>>(
        (counts, candidate) => {
          counts[candidate.qualification.verdict] =
            (counts[candidate.qualification.verdict] ?? 0) + 1;
          return counts;
        },
        {}
      ),
      note: 'Nothing was drafted or sent. Drafts are created only by the operator batching flow, and every send requires an approved template version plus an approved batch id.',
    };
  }

  console.log(JSON.stringify(report, null, 2));

  if (values['mark-run']) {
    await markWinbackShippedWatermark(db, diff.currentKeys, now);
    console.error('watermark advanced');
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('[winback-dry-run] failed:', error);
    process.exit(1);
  });
