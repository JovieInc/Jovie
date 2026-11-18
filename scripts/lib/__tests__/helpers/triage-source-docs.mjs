import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { loadRegistry as loadAutomationRegistry } from '../../automation-registry.mjs';

/** Register the source-owned triage contract in the existing doc-freshness suite. */
export function registerTriageSourceDocsTest() {
  it('keeps triage recovery documentation linked to its owning source instead of copying cadence', () => {
    const repoRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../..'
    );
    const automationRegistry = loadAutomationRegistry(repoRoot);
    const triage = automationRegistry.entries.find(
      entry => entry.id === 'summer:triage-dwell'
    );
    const sourcePath = triage.trigger.source.split(' (')[0];
    expect(sourcePath).toBe('apps/summer/agent/lib/event-catch-ups.ts');
    const sourceUrl = `https://github.com/${triage.trigger.repo}/blob/main/${sourcePath}`;
    const rule = readFileSync(
      join(repoRoot, '.claude/rules/event-driven.md'),
      'utf8'
    );
    const row = rule
      .split('\n')
      .find(line => line.startsWith('| Linear Triage'));
    const backstop = row.split('|')[3];
    expect(backstop).toContain(sourceUrl);
    expect(row.split('|')[4].trim()).toBe(`${triage.maxStalenessMinutes} min`);
    expect(triage.receipt.dwellSloMinutes).toBe(triage.maxStalenessMinutes);
    // The source owns changing recovery intervals. The registry still owns
    // the dwell SLO; the linked source alone cannot attest a deployed build.
    const copiedCadence =
      /\b(?:hourly|daily|\d+\s*[- ]?\s*(?:min(?:ute)?s?|hours?|seconds?))\b/i;
    expect(backstop).not.toMatch(copiedCadence);
    expect(triage.trigger.schedule).not.toMatch(copiedCadence);
    expect(rule).toContain(
      '../../scripts/backlog-orchestrator/triage-event-assess.mjs'
    );
  });
}
