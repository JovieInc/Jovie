/**
 * Render a Digital Footprint & Visibility Audit from a stored snapshot.
 *
 *   pnpm --dir apps/web visibility-audit
 *   pnpm --dir apps/web visibility-audit -- --input ./snapshot.json --out ./report.md
 *
 * The default input is the committed Tim White (/tim) fixture. This script
 * does not call MusicFetch, SerpAPI, or ingestion fetchers.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assembleVisibilityAudit } from '@/lib/visibility-audit/assemble';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from '@/lib/visibility-audit/fixtures/tim-white';
import { renderVisibilityAuditMarkdown } from '@/lib/visibility-audit/render-markdown';
import { parseVisibilityAuditInput } from '@/lib/visibility-audit/schema';

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

const inputPath = readArg('--input');
const outPath = readArg('--out');

const raw = inputPath
  ? JSON.parse(readFileSync(inputPath, 'utf8'))
  : TIM_WHITE_VISIBILITY_AUDIT_INPUT;
const parsed = parseVisibilityAuditInput(raw);
if (!parsed.ok) {
  process.stderr.write(`${parsed.error}\n`);
  process.exit(1);
}

const markdown = renderVisibilityAuditMarkdown(
  assembleVisibilityAudit(parsed.input)
);

if (!outPath) {
  process.stdout.write(markdown);
} else {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown);
  process.stdout.write(`${outPath}\n`);
}
