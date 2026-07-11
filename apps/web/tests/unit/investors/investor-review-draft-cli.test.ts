import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildInvestorNoteReviewArtifact } from '@/lib/investors/note-ingestion';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('investor review draft CLI', () => {
  it('defaults to a side-effect-free deterministic dry run', () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'investor-review-draft-')
    );
    directories.push(directory);
    const artifact = buildInvestorNoteReviewArtifact([
      {
        source: {
          id: 'conversation-dry-run',
          kind: 'local-note',
          label: 'Dry run',
          capturedAt: '2026-07-11',
        },
        transcript: 'Synthetic.',
        signals: [
          {
            kind: 'question',
            text: 'What traction is proven?',
            gapClassification: 'evidence',
            severity: 'high',
          },
        ],
      },
    ]);
    const candidate = artifact.candidates[0]!;
    const artifactPath = path.join(directory, 'artifact.json');
    const proposalPath = path.join(directory, 'proposal.json');
    writeFileSync(artifactPath, JSON.stringify(artifact));
    writeFileSync(
      proposalPath,
      JSON.stringify({
        proposalVersion: '1.0.0',
        slug: 'dry-run-review',
        title: 'Dry-run investor review',
        approvedCandidates: [
          {
            key: candidate.key,
            proposedCopy: 'Sourced copy for manual review.',
            action: 'Review only.',
            target: 'fundraisingRegistry.claims',
            protectedFields: ['claims'],
            evidence: [candidate.sources[0]],
          },
        ],
      })
    );
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'tsx',
        'scripts/create-investor-review-draft.ts',
        `--proposal=${proposalPath}`,
        `--artifact=${artifactPath}`,
      ],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'dry-run',
      branch: 'codex/investor-review-dry-run-review',
    });
    expect(JSON.parse(result.stdout).markdown).toContain(
      'manual review required'
    );
  }, 20_000);
});
