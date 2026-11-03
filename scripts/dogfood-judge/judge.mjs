// Tiered multimodal judge: a cheap screen model judges every step, a strong
// model re-judges only the steps the screen failed (it may clear, downgrade or
// add findings). Transport and envelope handling reuse the funnel judge's
// subscription-lane `claude` CLI path (no gateway, no raw API keys).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildClaudeArgs, runJudge } from '../funnel-judge/judge.mjs';
import {
  buildColdPrompt,
  buildColdSchema,
  buildJudgePrompt,
  buildJudgeSchema,
  COLD_PASS_VERSION,
  coldFails,
  parseColdOutput,
  parseJudgeOutput,
  RUBRIC_VERSION,
  runVerdict,
} from './rubric.mjs';

const STEPS_PER_CALL = 4;

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Pen refs for a step: refs listing the step, else every ref with a path. */
export function penRefsForSteps(penRefs, stepIds) {
  const withPath = (penRefs ?? []).filter(ref => ref.absPath);
  const scoped = withPath.filter(
    ref => !ref.steps || ref.steps.some(id => stepIds.includes(id))
  );
  return scoped.length ? scoped : withPath;
}

async function judgeBatch({
  surface,
  steps,
  penRefs,
  tier,
  model,
  prior = null,
  dirs,
  timeoutMs,
}) {
  const stepIds = steps.map(step => step.id);
  const imageNames = steps.flatMap(step =>
    step.images.map(image => image.name)
  );
  const refs = penRefsForSteps(penRefs, stepIds).map(ref => ({
    id: ref.id,
    title: ref.title,
    path: ref.absPath,
  }));
  const args = buildClaudeArgs({
    model,
    prompt: buildJudgePrompt({ surface, steps, penRefs: refs, tier, prior }),
    schema: buildJudgeSchema(stepIds, imageNames),
    imageDir: dirs,
  });
  const started = Date.now();
  const envelope = await runJudge(args, dirs[0], timeoutMs);
  const parsed = parseJudgeOutput(envelope.structured_output, stepIds);
  return {
    ...parsed,
    call: {
      tier,
      model,
      steps: stepIds,
      costUsd: envelope.total_cost_usd ?? null,
      ms: Date.now() - started,
      usage: envelope.usage ?? null,
    },
  };
}

/**
 * @param {{ manifest: any, penRefs: any[], tiers: { screen: string, confirm: string }, outDir: string, confirmAll?: boolean, cold?: boolean, timeoutMs?: number, log?: (line: string) => void }} args
 */
export async function judgeRun({
  manifest,
  penRefs,
  tiers,
  outDir,
  confirmAll = false,
  cold = true,
  timeoutMs = 900_000,
  log = () => {},
}) {
  const dirs = [
    ...new Set([
      manifest.runDir,
      join(outDir, 'frames'),
      ...penRefs.filter(ref => ref.absPath).map(ref => dirname(ref.absPath)),
    ]),
  ].filter(dir => existsSync(dir));
  const calls = [];
  const byStep = new Map();

  for (const steps of chunk(manifest.steps, STEPS_PER_CALL)) {
    log(`screen ${tiers.screen}: ${steps.map(s => s.id).join(', ')}`);
    const result = await judgeBatch({
      surface: manifest.surface,
      steps,
      penRefs,
      tier: 'screen',
      model: tiers.screen,
      dirs,
      timeoutMs,
    });
    calls.push(result.call);
    for (const step of result.steps)
      byStep.set(step.stepId, { ...step, tier: 'screen' });
  }

  const toConfirm = manifest.steps.filter(
    step => confirmAll || byStep.get(step.id)?.verdict === 'fail'
  );
  for (const steps of chunk(toConfirm, STEPS_PER_CALL)) {
    log(`confirm ${tiers.confirm}: ${steps.map(s => s.id).join(', ')}`);
    const prior = steps.map(step => {
      const s = byStep.get(step.id);
      return {
        stepId: step.id,
        findings: s.findings.map(
          ({ criterion, severity, image, evidence, detail }) => ({
            criterion,
            severity,
            image,
            evidence,
            detail,
          })
        ),
      };
    });
    const result = await judgeBatch({
      surface: manifest.surface,
      steps,
      penRefs,
      tier: 'confirm',
      model: tiers.confirm,
      prior,
      dirs,
      timeoutMs,
    });
    calls.push(result.call);
    for (const step of result.steps) {
      const screen = byStep.get(step.stepId);
      byStep.set(step.stepId, {
        ...step,
        tier: 'confirm',
        screenVerdict: screen.verdict,
        screenFindings: screen.findings.length,
      });
    }
  }

  // Cold screenshot test: the strong model sees only the images, no rubric.
  const coldByImage = new Map();
  if (cold) {
    for (const steps of chunk(manifest.steps, STEPS_PER_CALL)) {
      const images = steps.flatMap(step => step.images);
      log(`cold ${tiers.confirm}: ${steps.map(s => s.id).join(', ')}`);
      const started = Date.now();
      const envelope = await runJudge(
        buildClaudeArgs({
          model: tiers.confirm,
          prompt: buildColdPrompt(images),
          schema: buildColdSchema(images.map(i => i.name)),
          imageDir: dirs,
        }),
        dirs[0],
        timeoutMs
      );
      for (const entry of parseColdOutput(
        envelope.structured_output,
        images.map(i => i.name)
      ))
        coldByImage.set(entry.image, entry.issues);
      calls.push({
        tier: 'cold',
        model: tiers.confirm,
        steps: steps.map(s => s.id),
        costUsd: envelope.total_cost_usd ?? null,
        ms: Date.now() - started,
        usage: envelope.usage ?? null,
      });
    }
  }

  const imageIndex = new Map(
    manifest.steps.flatMap(step =>
      step.images.map(image => [image.name, image])
    )
  );
  const steps = manifest.steps.map(step => {
    const judged = byStep.get(step.id);
    const findings = judged.findings.map((finding, index) => {
      const image = imageIndex.get(finding.image);
      return {
        ...finding,
        id: `${step.id}-${index + 1}`,
        t: image?.t ?? null,
        video: image?.video ?? step.video ?? null,
        imagePath: image?.path ?? null,
        crop: image
          ? cropFinding(
              image.path,
              finding.bbox,
              join(outDir, 'crops', `${step.id}-${index + 1}.png`)
            )
          : null,
      };
    });
    const coldIssues = step.images.flatMap(image =>
      (coldByImage.get(image.name) ?? []).map(issue => ({
        ...issue,
        image: image.name,
      }))
    );
    const coldFindings = coldIssues
      .filter(issue => issue.credible)
      .map((issue, index) => {
        const image = imageIndex.get(issue.image);
        const id = `${step.id}-cold-${index + 1}`;
        return {
          id,
          criterion: 'COLD',
          severity: issue.severity,
          image: issue.image,
          bbox: issue.bbox,
          evidence: 'cold screenshot test (no context)',
          detail: issue.detail,
          fix: 'Fix what a first look catches, then re-record.',
          t: image?.t ?? null,
          video: image?.video ?? step.video ?? null,
          imagePath: image?.path ?? null,
          crop: image
            ? cropFinding(
                image.path,
                issue.bbox,
                join(outDir, 'crops', `${id}.png`)
              )
            : null,
        };
      });
    const coldVerdict = cold
      ? coldFails(coldIssues)
        ? 'fail'
        : 'pass'
      : 'not-run';
    const verdict =
      judged.verdict === 'fail' || coldVerdict === 'fail' ? 'fail' : 'pass';
    return {
      ...step,
      ...judged,
      rubricVerdict: judged.verdict,
      coldVerdict,
      verdict,
      findings: [...findings, ...coldFindings],
    };
  });
  const unjudgeable = (manifest.unjudgeable ?? []).map(step => ({
    ...step,
    verdict: 'fail',
    reason: 'not recorded: a step nobody watched cannot pass',
  }));
  const costUsd = calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  return {
    rubricVersion: RUBRIC_VERSION,
    coldPassVersion: cold ? COLD_PASS_VERSION : null,
    tiers,
    steps,
    unjudgeable,
    verdict: unjudgeable.length ? 'fail' : runVerdict(steps),
    calls,
    costUsd,
  };
}

/** Crop a finding's bbox (fractions) out of its image, padded for context. */
export function cropFinding(imagePath, bbox, outPath) {
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    const [x, y, w, h] = bbox;
    const pad = 0.03;
    const cx = Math.max(0, x - pad);
    const cy = Math.max(0, y - pad);
    const cw = Math.min(1 - cx, w + 2 * pad);
    const ch = Math.min(1 - cy, h + 2 * pad);
    const filter = `crop=iw*${cw.toFixed(4)}:ih*${ch.toFixed(4)}:iw*${cx.toFixed(4)}:ih*${cy.toFixed(4)}`;
    const result = spawnSync(
      'ffmpeg',
      ['-hide_banner', '-y', '-i', imagePath, '-vf', filter, outPath],
      { encoding: 'utf8' }
    );
    return result.status === 0 && existsSync(outPath) ? outPath : null;
  } catch {
    return null;
  }
}
