#!/usr/bin/env node

/**
 * AI Changelog Generator
 *
 * Reads the [Unreleased] section from CHANGELOG.md, calls Claude Sonnet API
 * to rewrite technical entries into customer-friendly language, and writes
 * the result back.
 *
 * Usage:
 *   pnpm changelog:generate
 *   doppler run -- node scripts/generate-changelog.mjs
 *
 * Requires: ANTHROPIC_API_KEY in environment (via Doppler)
 *
 * Graceful fallback: if the API call fails, original entries are preserved.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getUnreleased,
  hasUnreleasedEntries,
  replaceUnreleased,
} from './lib/changelog-parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md');

const SYSTEM_PROMPT = `You are a product copywriter for Jovie, a music career platform for independent artists.

Your job is to rewrite technical changelog entries into plain-English product updates that a non-technical musician or investor would understand and find exciting.

Rules:
- Rewrite each technical entry as a clear, benefit-focused update
- Group related changes together when they serve the same user benefit
- Skip internal-only changes: CI, test infrastructure, dev tooling, chore commits, dependency bumps, code refactoring that doesn't change behavior
- Write in active voice, present tense ("Faster page loads" not "Fixed performance issue")
- Keep the markdown structure: ### Added, ### Changed, ### Fixed, ### Removed
- Each entry must be one line starting with "- "
- Be concise — aim for roughly half the original entry count by grouping related items
- If ALL entries are internal-only, output a single entry under ### Changed: "- Internal improvements and maintenance"
- Do NOT include version numbers, dates, or PR references
- Focus on what the USER gets, not what the CODE does

Example rewrites:
- "fix: parameterize SQL in batch updates, remove timing leaks" → "Strengthened security across the platform"
- "perf(profile): lazy-load drawers and parallelize tour dates" → "Artist profiles now load faster"
- "feat(home): real profiles in See It In Action" → "The homepage now showcases real artist profiles"
- "style: pill-shaped buttons on dashboard organisms" → "Refreshed button design across the dashboard"

Output ONLY the markdown content (### sections and bullet points). No preamble, no explanation.`;

async function main() {
  const changelog = readFileSync(CHANGELOG_PATH, 'utf-8');

  if (!hasUnreleasedEntries(changelog)) {
    console.log('⚠️  [Unreleased] section is empty. Nothing to rewrite.');
    process.exit(0);
  }

  const unreleased = getUnreleased(changelog);
  console.log('📝 Current [Unreleased] entries:\n');
  console.log(unreleased);
  console.log('\n---\n');

  // Get git diff context for better rewrites
  let gitContext = '';
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null', {
      encoding: 'utf-8',
      cwd: ROOT,
    }).trim();
    gitContext = execSync(`git log --oneline ${lastTag}..HEAD`, {
      encoding: 'utf-8',
      cwd: ROOT,
    });
  } catch {
    try {
      gitContext = execSync('git log --oneline -20', {
        encoding: 'utf-8',
        cwd: ROOT,
      });
    } catch {
      gitContext = '(git history unavailable)';
    }
  }

  // Call Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('⚠️  ANTHROPIC_API_KEY not set. Keeping original entries.');
    process.exit(0);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    console.log('🤖 Calling Claude Sonnet to rewrite entries...\n');

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here are the current technical changelog entries to rewrite:\n\n${unreleased}\n\nRecent git history for context:\n\n${gitContext}`,
        },
      ],
    });

    const rewritten = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();

    if (!rewritten) {
      console.log('⚠️  AI returned empty response. Keeping original entries.');
      process.exit(0);
    }

    console.log('✨ Rewritten entries:\n');
    console.log(rewritten);
    console.log('\n---\n');

    const updated = replaceUnreleased(changelog, rewritten);
    writeFileSync(CHANGELOG_PATH, updated);
    console.log('✅ CHANGELOG.md updated with customer-friendly entries.');
  } catch (err) {
    console.error(`⚠️  AI rewrite failed: ${err.message}`);
    console.log('Keeping original entries.');
    process.exit(0);
  }
}

main();
