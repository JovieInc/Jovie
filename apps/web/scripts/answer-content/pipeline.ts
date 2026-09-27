#!/usr/bin/env tsx
/**
 * Answer-content pipeline: idea -> script -> launch (blog only in phase 1).
 *
 *   tsx scripts/answer-content/pipeline.ts ideas [--limit 3]
 *       Next ideas from data/answer-content/question-map.json, skipping
 *       questions already drafted or published. Prints JSON plus the Linear
 *       `content:idea` issue body for each (Summer turns them into Ovie cards).
 *   tsx scripts/answer-content/pipeline.ts certify <draft.md...>
 *       Machine-certify scripts and append results to the launch ledger.
 *   tsx scripts/answer-content/pipeline.ts launch <draft.md>
 *       Apply the publish gate. auto_publish moves the draft into
 *       content/blog; needs_founder_approval prints the approval issue body.
 *
 * Scripts are written by subscription agent lanes from the idea brief, never by
 * model API calls from this script.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { QuestionMap } from '@/lib/answer-content/question-map';
import {
  ideaIssueBody,
  selectAnswerIdeas,
} from '@/lib/content-primitive/ideas';
import {
  decideLaunch,
  FOUNDER_APPROVAL_LABEL,
  type LaunchLedger,
  recordCertification,
} from '@/lib/content-primitive/publish-gate';
import { certifyAnswerScript } from '@/lib/content-primitive/script-certification';

const WEB_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
export const PATHS = {
  map: join(WEB_ROOT, 'data', 'answer-content', 'question-map.json'),
  ledger: join(WEB_ROOT, 'data', 'answer-content', 'launch-ledger.json'),
  drafts: join(WEB_ROOT, 'content', 'answer-drafts'),
  blog: join(WEB_ROOT, 'content', 'blog'),
} as const;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** questionIds already scripted, from draft and published frontmatter. */
export function coveredQuestionIds(directories: readonly string[]): string[] {
  const ids: string[] = [];
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.md')) continue;
      const match = /^questionId:\s*(\S+)/m.exec(
        readFileSync(join(directory, name), 'utf8')
      );
      if (match?.[1]) ids.push(match[1]);
    }
  }
  return ids;
}

function slugOf(path: string): string {
  return basename(path).replace(/\.md$/, '');
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { limit: { type: 'string', default: '3' } },
  });
  const [command, ...files] = positionals;

  if (command === 'ideas') {
    const map = readJson<QuestionMap>(PATHS.map);
    const ideas = selectAnswerIdeas(map.entries, {
      covered: coveredQuestionIds([PATHS.drafts, PATHS.blog]),
      limit: Number.parseInt(values.limit ?? '3', 10),
    });
    for (const idea of ideas) {
      console.log(`### ${idea.title}\n\n${ideaIssueBody(idea)}\n`);
    }
    return;
  }

  if (command === 'certify') {
    let ledger = readJson<LaunchLedger>(PATHS.ledger);
    let failed = 0;
    for (const file of files) {
      const result = certifyAnswerScript(
        slugOf(file),
        readFileSync(file, 'utf8')
      );
      ledger = recordCertification(ledger, 'answer-article', {
        slug: result.slug,
        passed: result.passed,
        at: new Date().toISOString(),
      });
      if (!result.passed) failed++;
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.slug}`);
      for (const item of result.checks.filter(
        check => check.status !== 'passed'
      ))
        console.log(`  ${item.status} ${item.id}: ${item.summary}`);
    }
    writeFileSync(PATHS.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
    if (failed > 0) process.exitCode = 1;
    return;
  }

  if (command === 'launch') {
    const [file] = files;
    if (!file) throw new Error('launch needs a draft path');
    const slug = slugOf(file);
    const result = certifyAnswerScript(slug, readFileSync(file, 'utf8'));
    const decision = decideLaunch({
      contentType: 'answer-article',
      medium: 'article',
      channel: 'blog',
      slug,
      certified: result.passed,
      // The standard-tier judge runs in the authoring lane (`pnpm copy:judge
      // --tier standard`); until its receipt is wired, auto-publish stays closed.
      judged: false,
      ledger: readJson<LaunchLedger>(PATHS.ledger),
    });
    console.log(`${decision.decision}: ${decision.reason}`);
    if (decision.decision === 'auto_publish') {
      renameSync(file, join(PATHS.blog, `${slug}.md`));
      console.log(`published content/blog/${slug}.md`);
    } else if (decision.decision === 'needs_founder_approval') {
      console.log(
        `\nFile a Linear issue labeled ${FOUNDER_APPROVAL_LABEL}:\nApprove answer article "${result.frontmatter.title}" (content/answer-drafts/${slug}.md)`
      );
    } else {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error('usage: pipeline.ts <ideas|certify|launch> [files...]');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
