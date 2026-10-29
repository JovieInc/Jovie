// Shared fixtures for the dogfood judge tests (not a test file itself).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReceipt } from './receipt.mjs';
import { resolveBindings } from './registry.mjs';
import { RUBRIC_VERSION } from './rubric.mjs';

export const finding = (over = {}) => ({
  criterion: 'TT-03',
  severity: 'blocker',
  image: 'a',
  bbox: [0.1, 0.1, 0.2, 0.1],
  evidence: 'Start Pro ($12)',
  detail: 'Price on the waitlist receipt',
  fix: 'Remove the price CTA',
  ...over,
});

export function tempRegistryRoot({
  chat = 'zai/glm-5.3',
  family = 'gpt-6.1-terra',
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dj-reg-'));
  mkdirSync(join(root, 'apps/web/lib/constants'), { recursive: true });
  mkdirSync(join(root, 'ops/registry'), { recursive: true });
  writeFileSync(
    join(root, 'apps/web/lib/constants/ai-models.ts'),
    `export const CHAT_MODEL = '${chat}';\n`
  );
  writeFileSync(
    join(root, 'ops/registry/capacity.json'),
    JSON.stringify({
      modelFamilies: { families: { 'openai:terra': { latest: family } } },
      roles: {
        planner: {
          candidates: [
            {
              model: 'kimi',
              preferred: true,
              availability: { status: 'available' },
            },
          ],
        },
      },
    })
  );
  return root;
}

export const miniRegistry = (judgeConfirm = 'claude-opus-5-5') => ({
  roiWeights: { goldenPath: 30, revenue: 2, traffic: 1 },
  judge: {
    tiers: { screen: 'claude-sonnet-5-5', confirm: judgeConfirm },
    maxReceiptAgeDays: 7,
  },
  bindingSources: {
    chat: {
      kind: 'ts-const',
      file: 'apps/web/lib/constants/ai-models.ts',
      name: 'CHAT_MODEL',
    },
    'drafting-terra': { kind: 'capacity-family', family: 'openai:terra' },
    'summer-planner': { kind: 'capacity-role', role: 'planner' },
    'judge-screen': { kind: 'judge-tier', tier: 'screen' },
    'judge-confirm': { kind: 'judge-tier', tier: 'confirm' },
  },
  surfaces: [
    {
      id: 'waitlist',
      status: 'judged',
      roi: { goldenPath: true, revenue: 9, traffic: 9 },
      models: ['chat'],
    },
    {
      id: 'outbound',
      status: 'queued',
      roi: { revenue: 9, traffic: 5 },
      models: ['drafting-terra'],
    },
    {
      id: 'cards',
      status: 'queued',
      roi: { revenue: 1, traffic: 1 },
      models: ['summer-planner'],
    },
  ],
});

export function sampleReceipt({
  verdict = 'pass',
  findings = [],
  cold = 'pass',
  unjudgeable = [],
} = {}) {
  const reg = miniRegistry();
  const resolved = resolveBindings(reg, tempRegistryRoot());
  return buildReceipt({
    surface: reg.surfaces[0],
    resolved,
    runId: 'waitlist-run-1',
    sourceSha: 'a'.repeat(40),
    judgedAt: new Date().toISOString(),
    manifest: { videos: [{ file: 'v.mp4', durationSec: 10 }] },
    result: {
      rubricVersion: RUBRIC_VERSION,
      coldPassVersion: 'cold-screenshot/test',
      tiers: reg.judge.tiers,
      verdict,
      costUsd: 0.5,
      calls: [],
      unjudgeable,
      steps: [
        {
          id: '4e',
          title: 'Receipt',
          verdict,
          rubricVerdict: verdict,
          coldVerdict: cold,
          tier: 'confirm',
          penGap: 2,
          penSummary: '',
          timQuote: '',
          images: [],
          findings,
        },
      ],
    },
  });
}
