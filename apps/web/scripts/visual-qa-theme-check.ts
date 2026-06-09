import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  getVisualQaRootDirectory,
  resolveVisualQaManifestPath,
} from '@/lib/agent-os/visual-qa/paths';
import { verifyVisualQaThemePair } from '@/lib/agent-os/visual-qa/theme-check';
import { isVisualQaRunManifest } from '@/lib/visual-qa/types';

async function main() {
  const runId = process.env.VISUAL_QA_RUN_ID?.trim();
  if (!runId) {
    throw new Error('VISUAL_QA_RUN_ID is required for visual QA theme checks.');
  }

  const manifestPath = resolveVisualQaManifestPath(runId);
  const raw = await readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!isVisualQaRunManifest(parsed) || parsed.runId !== runId) {
    throw new Error(`Invalid Visual QA manifest for run ${runId}.`);
  }

  const failures: string[] = [];

  for (const surface of parsed.surfaces) {
    const darkRecord = surface.themes.dark;
    const lightRecord = surface.themes.light;

    if (!darkRecord?.baselinePath || !lightRecord?.baselinePath) {
      continue;
    }

    const root = getVisualQaRootDirectory();
    const result = await verifyVisualQaThemePair({
      darkScreenshotPath: path.join(root, darkRecord.baselinePath),
      lightScreenshotPath: path.join(root, lightRecord.baselinePath),
    });

    console.log(
      `[visual-qa-theme-check] ${surface.surfaceId}: ${result.message}`
    );

    if (!result.passed) {
      failures.push(`${surface.surfaceId}: ${result.message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Visual QA theme checks failed:\n${failures.map(line => `- ${line}`).join('\n')}`
    );
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
