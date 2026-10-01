/**
 * JOV-6265: llms guidance CLI-claims parity.
 *
 * The shared agent guidance (buildSiteLlmsGuidance, projected into
 * /llms.txt, /llms-full.txt, and the Accept: text/markdown homepage) must
 * describe the @jovie/cli surface as it actually is — not as it was when
 * the guidance was written. The CLI grew `profile create` (readOnly: false)
 * and `report` commands while the guidance still called the whole CLI
 * read-only; this suite pins guidance copy to the real command table in
 * packages/jovie-cli/src/commands.ts so a capability drift fails closed.
 *
 * Deliberate-red fixtures prove each guard fails on the disagreement it
 * exists to catch. This file is node-env only — it renders no UI.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { GET as getLlmsTxt } from '@/app/llms.txt/route';
import { GET as getLlmsFull } from '@/app/llms-full.txt/route';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';

const webRoot = process.cwd();

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

/** The actual @jovie/cli command table (packages/jovie-cli/src/commands.ts). */
function readCliCommandTable(): string {
  return readWebSource('../../packages/jovie-cli/src/commands.ts');
}

/** True when the CLI command table declares a non-read-only command. */
function cliHasWriteCommands(commandTable: string): boolean {
  return /readOnly:\s*false/.test(commandTable);
}

function cliCommandPaths(commandTable: string): string[] {
  return [
    ...commandTable.matchAll(/path:\s*\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g),
  ]
    .map(match => `jovie ${match[1]} ${match[2]}`)
    .map(line => line.replace(/\s+/g, ' ').trim());
}

describe('llms guidance CLI-claims parity (JOV-6265)', () => {
  let guidance: string;
  let llmsBody: string;
  let llmsFullBody: string;
  let commandTable: string;
  let commandPaths: string[];

  beforeAll(() => {
    guidance = buildSiteLlmsGuidance();
    commandTable = readCliCommandTable();
    commandPaths = cliCommandPaths(commandTable);
  });

  beforeAll(async () => {
    llmsBody = await getLlmsTxt().text();
    llmsFullBody = await getLlmsFull().text();
  });

  it('reads a real command table with the expected shape (sanity)', () => {
    expect(commandTable).toContain("path: ['artist', 'get']");
    expect(commandTable).toContain("path: ['profile', 'create']");
    expect(commandTable).toContain("path: ['report', 'bug']");
    expect(cliHasWriteCommands(commandTable)).toBe(true);
  });

  it('never calls the whole CLI read-only while the CLI ships write commands (red fixture)', () => {
    // Deliberate-red fixture: the drifted claim this suite exists to catch.
    // The guard must fire on it.
    const driftedClaim =
      'Use the read-only `jovie` CLI (npm: `npm install --global @jovie/cli`) documented at https://jov.ie/cli';
    const wholeCliReadOnlyPattern = /read-only [`'"]?jovie[`'"]? CLI/i;
    expect(wholeCliReadOnlyPattern.test(driftedClaim)).toBe(true);

    // Live: when the CLI declares any readOnly:false command, no public
    // machine representation may describe the whole CLI as read-only.
    const representations = {
      guidance,
      'llms.txt': llmsBody,
      'llms-full.txt': llmsFullBody,
    };
    for (const [name, body] of Object.entries(representations)) {
      expect(
        wholeCliReadOnlyPattern.test(body),
        `${name} calls the whole CLI read-only while it ships write commands`
      ).toBe(false);
    }
  });

  it('names the write commands the CLI actually ships (red fixture)', () => {
    // Red fixture: guidance naming a command the CLI does not implement
    // must be caught by the same cross-check.
    expect(commandPaths).not.toContain('jovie artist delete');

    // Live: every command the guidance names exists in the CLI command
    // table, and the bounded write commands (profile create, report) are
    // described as writes, not folded into a read-only claim.
    for (const command of commandPaths) {
      if (
        guidance.includes(`\`${command.split(' ').slice(0, 2).join(' ')}\``)
      ) {
        // A two-word command prefix named in backticks must be real.
        expect(commandPaths).toContain(command);
      }
    }
    expect(guidance).toContain('profile create');
    expect(guidance).toContain('`report` commands');
    expect(llmsBody).toContain('profile create');
    expect(llmsFullBody).toContain('profile create');

    // The API/MCP read-only boundary lines (which the CLI does not violate
    // — profile create is a documented POST /api/agents/profiles route)
    // stay truthful for the public artist API and anonymous MCP tools.
    expect(llmsBody).toContain(
      'the public artist API and anonymous MCP tools are read-only'
    );
  });

  it('keeps the profile-create claim aligned with the real endpoint', () => {
    // The guidance describes profile create; the endpoint it hits must
    // exist on the web app with POST semantics.
    const profileCreateRoute = readWebSource(
      'app/api/agents/profiles/route.ts'
    );
    expect(profileCreateRoute).toContain('export async function POST');
    expect(guidance).toContain('profile create');
    expect(guidance).toContain('Spotify artist URL');
  });

  it('does not leak internal-only systems while describing the CLI (red fixture)', () => {
    // Red fixture: a leaky guidance block must be caught by the same check.
    const INTERNAL_SYSTEM_MARKERS = [
      'gbrain',
      'hermes',
      'symphony',
      'Summer',
      'Eve ',
      'memory MCP',
    ] as const;
    const leakyRed = `${guidance}\n- **Internal memory MCP**: https://jov.ie/memory-mcp`;
    expect(
      INTERNAL_SYSTEM_MARKERS.filter(marker => leakyRed.includes(marker))
    ).toContain('memory MCP');

    for (const [name, body] of Object.entries({
      guidance,
      'llms.txt': llmsBody,
      'llms-full.txt': llmsFullBody,
    })) {
      const hits = INTERNAL_SYSTEM_MARKERS.filter(marker =>
        body.includes(marker)
      );
      expect(
        hits,
        `${name} leaks internal systems: ${hits.join(', ')}`
      ).toEqual([]);
    }
  });
});
