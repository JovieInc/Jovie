import { spawn } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { TasteInboxLabel } from '../linear';

export interface TastePreferenceWriteInput {
  readonly issueId: string;
  readonly identifier: string;
  readonly title: string;
  readonly label: TasteInboxLabel;
  readonly decision: 'approved' | 'rejected';
  readonly reviewerSlackUserId: string;
  readonly linearUrl: string;
}

function formatPreferenceMarkdown(input: TastePreferenceWriteInput): string {
  const timestamp = new Date().toISOString();
  return [
    '---',
    `title: Taste preference — ${input.identifier}`,
    'tags:',
    '  - taste-inbox',
    '  - taste-preference',
    `decision: ${input.decision}`,
    `linear_issue: ${input.identifier}`,
    `label: ${input.label}`,
    `reviewer_slack_user: ${input.reviewerSlackUserId}`,
    `recorded_at: ${timestamp}`,
    '---',
    '',
    `# Taste preference — ${input.identifier}`,
    '',
    `- Decision: **${input.decision}**`,
    `- Label: \`${input.label}\``,
    `- Issue: [${input.identifier}](${input.linearUrl})`,
    `- Title: ${input.title}`,
    `- Reviewer (Slack): ${input.reviewerSlackUserId}`,
    `- Recorded: ${timestamp}`,
    '',
  ].join('\n');
}

function resolveLocalPreferenceLogPath(rootDir = process.cwd()): string {
  return path.join(rootDir, 'data', 'taste-preferences.log.md');
}

async function appendLocalPreferenceLog(
  content: string,
  rootDir = process.cwd()
): Promise<string> {
  const logPath = resolveLocalPreferenceLogPath(rootDir);
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${content}\n`, 'utf8');
  return logPath;
}

async function tryGbrainIngest(content: string): Promise<string | null> {
  const gbrainBin = process.env.GBRAIN_BIN?.trim() || 'gbrain';
  const tags = 'source:taste-inbox,kind:taste-preference';

  return new Promise(resolve => {
    const child = spawn(
      gbrainBin,
      ['ingest', '--tags', tags, '--stdin-text', '--print-id'],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    let stdout = '';
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 30_000);

    child.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });

    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve(null);
        return;
      }
      const id = stdout.trim();
      resolve(id.length > 0 ? id : null);
    });

    child.stdin.write(content);
    child.stdin.end();
  });
}

export async function writeTastePreference(
  input: TastePreferenceWriteInput,
  rootDir = process.cwd()
): Promise<{
  readonly localLogPath: string;
  readonly gbrainEntryId: string | null;
}> {
  const content = formatPreferenceMarkdown(input);
  const localLogPath = await appendLocalPreferenceLog(content, rootDir);
  const gbrainEntryId = await tryGbrainIngest(content);
  return { localLogPath, gbrainEntryId };
}
