#!/usr/bin/env node
// Funnel conversion judge (JOV-7753).
//
//   node scripts/funnel-judge/run.mjs --base-url https://jov.ie --handle megaran
//
// Captures every funnel step, has 5 ICP personas judge it on two subscription
// CLI judges, applies the pass bar and writes a JSON receipt plus one trend
// line. Exit code 0 = pass, 1 = fail, 2 = scorer error or failed calibration.

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { captureFunnel } from './capture.mjs';
import { JUDGES, judgePersona } from './judge.mjs';
import {
  calibrationHolds,
  evaluatePassBar,
  PERSONAS,
  RUBRIC_VERSION,
  trendLine,
  worstStep,
} from './rubric.mjs';
import {
  CALIBRATION_STEP_ID,
  FUNNEL_STEPS,
  renderOutreachDm,
} from './steps.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string', default: 'https://jov.ie' },
    handle: { type: 'string', default: 'megaran' },
    out: { type: 'string' },
    trend: {
      type: 'string',
      default: join(ROOT, 'scripts/funnel-judge/trend.jsonl'),
    },
    personas: { type: 'string' },
    'skip-judge': { type: 'boolean', default: false },
    'no-emotional': { type: 'boolean', default: false },
    'no-throttle': { type: 'boolean', default: false },
    calibrate: { type: 'boolean', default: false },
    label: { type: 'string', default: '' },
    concurrency: { type: 'string', default: '3' },
  },
});

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function displayNameFrom(captures, handle) {
  const og = captures.find(
    capture => capture.stepId === 'outreach' && capture.ogTitle
  );
  return og ? og.ogTitle.replace(/\s*\|\s*Jovie\s*$/, '') : handle;
}

async function main() {
  const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const outDir = resolve(
    values.out ?? join(ROOT, '.cache/funnel-judge', runId)
  );
  mkdirSync(outDir, { recursive: true });
  const baseUrl = values['base-url'];
  const handle = values.handle;

  console.log(`[funnel-judge] capturing ${baseUrl} as @${handle} → ${outDir}`);
  const captures = await captureFunnel({
    baseUrl,
    handle,
    steps: FUNNEL_STEPS,
    outDir,
    throttleMobile: !values['no-throttle'],
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined,
  });

  const displayName = displayNameFrom(captures, handle);
  const judgeSteps = FUNNEL_STEPS.map(step => {
    const stepCaptures = captures.filter(capture => capture.stepId === step.id);
    const images = stepCaptures.map(capture => capture.image).filter(Boolean);
    return {
      id: step.id,
      label: step.label,
      context: step.context,
      images,
      text:
        step.id === 'outreach'
          ? renderOutreachDm({
              displayName,
              claimLink: `${new URL(baseUrl).host}/claim/…`,
            })
          : undefined,
      captured: images.length > 0,
    };
  }).filter(step => step.captured);

  /** @type {Array<any>} */
  let verdicts = [];
  const judgeErrors = [];
  if (!values['skip-judge']) {
    const personaIds = values.personas?.split(',');
    const personas = personaIds
      ? PERSONAS.filter(persona => personaIds.includes(persona.id))
      : PERSONAS;
    const judges = values['no-emotional']
      ? [JUDGES.primary]
      : [JUDGES.primary, JUDGES.emotional];
    const jobs = personas.flatMap(persona =>
      judges.map(judge => ({ persona, judge }))
    );
    console.log(
      `[funnel-judge] judging ${judgeSteps.length} steps × ${jobs.length} persona runs`
    );
    const results = await mapLimit(
      jobs,
      Number(values.concurrency),
      async ({ persona, judge }) => {
        try {
          const verdict = await judgePersona({
            persona,
            judge,
            steps: judgeSteps,
            imageDir: outDir,
          });
          console.log(
            `[funnel-judge] ${persona.id}/${judge.id}: pay=${verdict.wouldPay} ` +
              verdict.steps
                .map(
                  step =>
                    `${step.stepId}:${step.value}/${step.clarity}/${step.positivity}`
                )
                .join(' ')
          );
          return verdict;
        } catch (error) {
          judgeErrors.push(
            `${persona.id}/${judge.id}: ${error instanceof Error ? error.message : error}`
          );
          return null;
        }
      }
    );
    verdicts = results.filter(Boolean);
  }

  const result = evaluatePassBar({
    stepIds: judgeSteps.map(step => step.id),
    verdicts,
    primaryJudge: JUDGES.primary.id,
    metrics: /** @type {any} */ (captures),
  });
  if (judgeErrors.length > 0) {
    result.pass = false;
    result.failures.unshift(
      ...judgeErrors.map(error => `judge failed: ${error}`)
    );
  }

  const receipt = {
    runId,
    at: new Date().toISOString(),
    label: values.label,
    rubric: RUBRIC_VERSION,
    baseUrl,
    handle,
    displayName,
    outDir,
    captures,
    verdicts,
    result,
    worst: worstStep(result.aggregates),
    calibration: values.calibrate
      ? {
          stepId: CALIBRATION_STEP_ID,
          holds: calibrationHolds(result, CALIBRATION_STEP_ID),
        }
      : null,
  };
  writeFileSync(
    join(outDir, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  if (!values['skip-judge'])
    appendFileSync(values.trend, `${trendLine(receipt)}\n`);

  console.log(
    `[funnel-judge] ${result.pass ? 'PASS' : 'FAIL'} (${result.failures.length} failures)`
  );
  for (const failure of result.failures.slice(0, 20))
    console.log(`  - ${failure}`);
  console.log(`[funnel-judge] receipt ${join(outDir, 'receipt.json')}`);

  if (judgeErrors.length > 0) return 2;
  if (receipt.calibration && !receipt.calibration.holds) {
    console.error(
      '[funnel-judge] calibration FAILED: the rubric passed a screen Tim rejected'
    );
    return 2;
  }
  return result.pass ? 0 : 1;
}

main().then(
  code => process.exit(code),
  error => {
    console.error(error);
    process.exit(2);
  }
);
