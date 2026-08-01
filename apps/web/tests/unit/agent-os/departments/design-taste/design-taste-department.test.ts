import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeParseAgentRunArtifact } from '@/lib/agent-os/artifact';
import {
  decideDesignTasteDispatch,
  parseUnifiedDiff,
  reviewDesignTasteHunks,
  runDesignTasteDepartment,
} from '@/lib/agent-os/departments/design-taste';

vi.mock('server-only', () => ({}));

const DIFF = `diff --git a/apps/web/components/features/dashboard/Card.tsx b/apps/web/components/features/dashboard/Card.tsx
--- a/apps/web/components/features/dashboard/Card.tsx
+++ b/apps/web/components/features/dashboard/Card.tsx
@@ -1,3 +1,5 @@
 export function Card() {
-  return <div className="bg-surface-1">Ok</div>;
+  return (
+    <div className="bg-surface-1/50 hover:translate-y-1 uppercase text-[#ff00aa]">Ship it 🚀</div>
+  );
 }`;

describe('design-taste department', () => {
  let policyPath = '';
  let rootDirectory = '';

  beforeEach(async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dt-dept-'));
    policyPath = path.join(root, 'memory.md');
    rootDirectory = path.join(root, 'runs');
    await writeFile(
      policyPath,
      '# Design Taste\n\n### Elevation\n- solid surfaces only.\n### Motion\n- no hover translate.\n'
    );
  });

  it('skips non-UI PRs and runs scheduled audits', () => {
    expect(
      decideDesignTasteDispatch({
        changedFiles: ['apps/web/lib/db/schema.ts'],
      }).shouldRun
    ).toBe(false);

    const scheduled = decideDesignTasteDispatch({
      changedFiles: ['apps/web/lib/db/schema.ts'],
      forceScheduledAudit: true,
    });
    expect(scheduled.shouldRun).toBe(true);
    expect(scheduled.trigger).toBe('scheduled-audit');
  });

  it('loads policy, flags violations, records AgentRunArtifact', async () => {
    const findings = reviewDesignTasteHunks(parseUnifiedDiff(DIFF));
    const rules = new Set(findings.map(f => f.ruleId));
    expect(rules.has('elevation')).toBe(true);
    expect(rules.has('motion')).toBe(true);
    expect(rules.has('emoji')).toBe(true);
    expect(rules.has('casing')).toBe(true);
    expect(rules.has('hardcoded-token')).toBe(true);

    const result = await runDesignTasteDepartment({
      runId: `r-${Date.now().toString(36)}`,
      changedFiles: ['apps/web/components/features/dashboard/Card.tsx'],
      unifiedDiff: DIFF,
      linearIssueId: 'JOV-2012',
      pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/1',
      policyPath,
      rootDirectory,
    });

    expect(result.ran).toBe(true);
    expect(result.trigger).toBe('ui-pr');
    expect(result.manifest?.policyExcerpt).toContain('Elevation');
    expect(result.manifest?.kpis.violationsCaught).toBeGreaterThan(0);
    expect(result.manifest?.kpis.designSystemCoverage).toBeLessThan(1);
    expect(result.manifest?.kpis.surfaceElevationConsistencyScore).toBeLessThan(
      1
    );
    expect(result.manifest?.proposals.map(p => p.kind)).toEqual(
      expect.arrayContaining(['pr-comment', 'auto-fix-branch'])
    );

    const artifactRaw = JSON.parse(
      await readFile(result.artifactPath!, 'utf8')
    );
    const parsed = safeParseAgentRunArtifact(artifactRaw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe('design_review');
      expect(parsed.data.metadata.department).toBe('design-taste');
      expect(parsed.data.humanApprovalRequired).toBe(true);
    }

    const prComment = await readFile(result.prCommentPath!, 'utf8');
    expect(prComment).toContain('Design/Taste Department Review');
    expect(prComment).toContain('agent-run-artifact');
  });

  it('fails closed when design-taste policy is missing', async () => {
    await expect(
      runDesignTasteDepartment({
        runId: 'missing-policy',
        changedFiles: ['apps/web/components/features/dashboard/Card.tsx'],
        unifiedDiff: DIFF,
        policyPath: path.join(rootDirectory, 'does-not-exist.md'),
        rootDirectory,
      })
    ).rejects.toThrow(/policy missing/i);
  });
});
