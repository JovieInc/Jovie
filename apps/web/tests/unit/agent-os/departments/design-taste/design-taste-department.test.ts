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
@@ -1,3 +1,4 @@
 export function Card() {
-  return <div className="bg-surface-1">Ok</div>;
+  return <div className="bg-surface-1/50 hover:translate-y-1 text-[#ff00aa]">Ship it 🚀</div>;
 }`;
describe('design-taste department', () => {
  let policyPath = '';
  let rootDirectory = '';
  beforeEach(async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dt-dept-'));
    policyPath = path.join(root, 'memory.md');
    rootDirectory = path.join(root, 'runs');
    await writeFile(policyPath, '# Design Taste\n\n### Elevation\n- solid.\n');
  });
  it('loads policy, flags violations, records AgentRunArtifact', async () => {
    expect(
      decideDesignTasteDispatch({
        changedFiles: ['apps/web/lib/db/schema.ts'],
      }).shouldRun
    ).toBe(false);
    const rules = new Set(
      reviewDesignTasteHunks(parseUnifiedDiff(DIFF)).map(f => f.ruleId)
    );
    expect(rules.has('elevation')).toBe(true);
    expect(rules.has('motion')).toBe(true);
    expect(rules.has('emoji')).toBe(true);
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
    expect(result.manifest?.policyExcerpt).toContain('Elevation');
    expect(result.manifest?.proposals.map(p => p.kind)).toEqual(
      expect.arrayContaining(['pr-comment', 'auto-fix-branch'])
    );
    const parsed = safeParseAgentRunArtifact(
      JSON.parse(await readFile(result.artifactPath!, 'utf8'))
    );
    expect(parsed.success && parsed.data.kind === 'design_review').toBe(true);
  });
});
