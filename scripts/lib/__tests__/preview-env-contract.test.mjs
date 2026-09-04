import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPreviewEnvAdmission,
  buildPreviewEnvCleanupReceipt,
  EPHEMERAL_KINDS,
  isLivePreviewEnvAdmission,
  PREVIEW_ENV_ADMISSION_SCHEMA,
  PREVIEW_ENV_CLEANUP_SCHEMA,
  PREVIEW_ENV_REGISTRY_PATH,
  PREVIEW_ENV_REGISTRY_SCHEMA,
  validatePreviewEnvAdmission,
  validatePreviewEnvCleanupReceipt,
  validatePreviewEnvRegistry,
} from '../preview-env-contract.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOWS_DIR = resolve(REPO_ROOT, '.github/workflows');

const REGISTRY = JSON.parse(
  readFileSync(resolve(REPO_ROOT, PREVIEW_ENV_REGISTRY_PATH), 'utf8')
);
const HUD_PROJECTION = JSON.parse(
  readFileSync(
    resolve(
      REPO_ROOT,
      'apps/web/lib/ovie/generated/preview-env-exceptions.json'
    ),
    'utf8'
  )
);

// Creation primitives that produce a hosted preview or an ephemeral database.
// A workflow matching any of these is a creation site and must be covered by
// the canonical registry with the admission/receipt contract bound.
const NEON_CREATION_PRIMITIVES = [
  'neon-create-branch-with-retry',
  'neonctl branches create',
];
const VERCEL_CREATION_PRIMITIVES = [
  'vercel-prebuilt-deploy.sh',
  'vercel deploy',
];
const VERCEL_KINDS = ['vercel-preview', 'staging', 'production', 'shadow'];

const VALID_ADMISSION_FIELDS = {
  schema: PREVIEW_ENV_ADMISSION_SCHEMA,
  kind: 'neon-branch',
  workId: 'JOV-5941',
  sha: 'a'.repeat(40),
  policy: 'manual-dispatch',
  reason: 'Database-affecting evidence for a migration change.',
  requiredEvidence: 'Migration proof against an isolated database.',
  owner: 'release engineering',
  surface: 'ephemeral Neon branch (isolated database only)',
  createdAt: '2026-09-03T00:00:00.000Z',
  expiresAt: '2026-09-03T02:00:00.000Z',
  cleanupTrigger: 'ttl',
  cleanupProof: 'Branch absent from the Neon project branch inventory',
  costBudget: 'One Neon branch with at most 2h of endpoint compute',
};

function workflowFiles() {
  return readdirSync(WORKFLOWS_DIR).filter(
    name => name.endsWith('.yml') || name.endsWith('.yaml')
  );
}

function vercelConfigPaths() {
  const paths = ['vercel.json'];
  for (const app of readdirSync(resolve(REPO_ROOT, 'apps'))) {
    const candidate = join('apps', app, 'vercel.json');
    if (existsSync(resolve(REPO_ROOT, candidate))) paths.push(candidate);
  }
  return paths;
}

describe('preview-env admission contract', () => {
  it('accepts a complete admission record', () => {
    expect(validatePreviewEnvAdmission(VALID_ADMISSION_FIELDS)).toEqual([]);
  });

  it('fails closed on every missing required field', () => {
    for (const field of Object.keys(VALID_ADMISSION_FIELDS)) {
      if (field === 'kind') continue;
      const record = { ...VALID_ADMISSION_FIELDS, [field]: '' };
      expect(
        validatePreviewEnvAdmission(record),
        `expected ${field} to be required`
      ).not.toEqual([]);
    }
  });

  it('rejects a record without a hard expiration', () => {
    expect(
      validatePreviewEnvAdmission({
        ...VALID_ADMISSION_FIELDS,
        expiresAt: '2026-09-02T00:00:00.000Z',
      })
    ).toContain('expiresAt must be after createdAt (hard expiration)');
  });

  it('rejects branch-head following by requiring an exact SHA', () => {
    const problems = validatePreviewEnvAdmission({
      ...VALID_ADMISSION_FIELDS,
      sha: 'main',
    });
    expect(problems).toContain(
      'sha must be the exact 40-hex commit the environment serves'
    );
  });

  it('builds validated admission and cleanup records', () => {
    const admission = buildPreviewEnvAdmission(VALID_ADMISSION_FIELDS);
    expect(admission.schema).toBe(PREVIEW_ENV_ADMISSION_SCHEMA);
    const receipt = buildPreviewEnvCleanupReceipt({
      kind: 'neon-branch',
      environment: 'ci-neon-run-123-1',
      cleanupTrigger: 'pr-closed',
      cleanedAt: '2026-09-03T01:00:00.000Z',
      cleanupProof: 'neonctl branches delete succeeded for ci-neon-run-123-1',
      cleanedBy: 'neon-ephemeral-branch-cleanup.yml',
    });
    expect(receipt.schema).toBe(PREVIEW_ENV_CLEANUP_SCHEMA);
    expect(validatePreviewEnvCleanupReceipt(receipt)).toEqual([]);
  });

  it('never counts expired or invalid environments as live evidence', () => {
    expect(
      isLivePreviewEnvAdmission(VALID_ADMISSION_FIELDS, {
        now: Date.parse('2026-09-03T01:00:00.000Z'),
      })
    ).toBe(true);
    expect(
      isLivePreviewEnvAdmission(VALID_ADMISSION_FIELDS, {
        now: Date.parse('2026-09-04T00:00:00.000Z'),
      })
    ).toBe(false);
    expect(isLivePreviewEnvAdmission({})).toBe(false);
  });
});

describe('preview-env registry', () => {
  it('is valid against the canonical schema', () => {
    expect(validatePreviewEnvRegistry(REGISTRY)).toEqual([]);
  });

  it('rejects ephemeral entries without a complete admission binding', () => {
    const broken = {
      schema: PREVIEW_ENV_REGISTRY_SCHEMA,
      entries: [
        {
          id: 'rogue',
          workflow: '.github/workflows/ci.yml',
          kind: 'neon-branch',
          ephemeral: true,
        },
      ],
    };
    const problems = validatePreviewEnvRegistry(broken);
    expect(problems.some(p => p.includes('admission'))).toBe(true);
  });

  it('covers every workflow that creates previews or ephemeral databases', () => {
    const uncovered = [];
    for (const file of workflowFiles()) {
      const workflowPath = `.github/workflows/${file}`;
      const source = readFileSync(join(WORKFLOWS_DIR, file), 'utf8');
      const createsNeon = NEON_CREATION_PRIMITIVES.some(p =>
        source.includes(p)
      );
      const createsVercel = VERCEL_CREATION_PRIMITIVES.some(p =>
        source.includes(p)
      );
      if (!createsNeon && !createsVercel) continue;
      const entries = REGISTRY.entries.filter(
        entry => entry.workflow === workflowPath
      );
      if (createsNeon) {
        const covered = entries.some(entry => entry.kind === 'neon-branch');
        if (!covered) {
          uncovered.push(
            `${workflowPath} creates Neon branches without a registry entry`
          );
        }
      }
      if (createsVercel) {
        const covered = entries.some(entry =>
          VERCEL_KINDS.includes(entry.kind)
        );
        if (!covered) {
          uncovered.push(
            `${workflowPath} creates Vercel deployments without a registry entry`
          );
        }
      }
    }
    expect(uncovered).toEqual([]);
  });

  it('has no stale entries: every entry binds a real creation site', () => {
    const stale = [];
    for (const entry of REGISTRY.entries) {
      const path = resolve(REPO_ROOT, entry.workflow);
      if (!existsSync(path)) {
        stale.push(`${entry.id}: workflow ${entry.workflow} does not exist`);
        continue;
      }
      const source = readFileSync(path, 'utf8');
      const primitives =
        entry.kind === 'neon-branch'
          ? NEON_CREATION_PRIMITIVES
          : VERCEL_CREATION_PRIMITIVES;
      if (!primitives.some(p => source.includes(p))) {
        stale.push(
          `${entry.id}: ${entry.workflow} contains no matching creation primitive`
        );
      }
    }
    expect(stale).toEqual([]);
  });

  it('binds every ephemeral lane to the admission contract fields', () => {
    for (const entry of REGISTRY.entries) {
      if (!entry.ephemeral) continue;
      expect(EPHEMERAL_KINDS, `${entry.id} kind`).toContain(entry.kind);
      expect(entry.admission.ttlHours, `${entry.id} ttlHours`).toBeGreaterThan(
        0
      );
      expect(
        entry.admission.cleanupTrigger,
        `${entry.id} cleanupTrigger`
      ).toBeTruthy();
    }
  });
});

describe('vercel git integration lock (JOV-5941)', () => {
  it('never auto-builds non-main/production refs from any Vercel project', () => {
    const violations = [];
    for (const path of vercelConfigPaths()) {
      const config = JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));
      const ignoreCommand = config.ignoreCommand || '';
      const guard =
        'R=$VERCEL_GIT_COMMIT_REF;if [[ $R == main || $R == production ]]; then ';
      if (!ignoreCommand.includes(guard)) {
        violations.push(
          `${path}: ignoreCommand must gate builds to main/production refs first`
        );
        continue;
      }
      // Outside the main/production branch, every path must skip the build.
      const outsideMain = ignoreCommand.slice(
        ignoreCommand.indexOf(guard) + guard.length
      );
      const skipsPrs =
        /then exit 1; fi;exit 0/.test(ignoreCommand) ||
        /else exit 0; fi/.test(ignoreCommand);
      if (
        !skipsPrs ||
        /fi;\s*(cd [^;]+ && )?npx turbo-ignore/.test(outsideMain)
      ) {
        violations.push(
          `${path}: non-main/production refs must skip the build (no PR previews)`
        );
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Ovie env-exceptions projection', () => {
  it('stays in sync with the canonical registry', () => {
    expect(HUD_PROJECTION.schema).toBe('jovie-preview-env-exceptions/v1');
    const registryLaneIds = REGISTRY.entries
      .filter(entry => entry.ephemeral)
      .map(entry => entry.id)
      .sort();
    const projectionLaneIds = HUD_PROJECTION.lanes.map(lane => lane.id).sort();
    expect(projectionLaneIds).toEqual(registryLaneIds);
  });

  it('marks every active exception with owner, expiry, and cleanup state', () => {
    for (const exception of HUD_PROJECTION.activeExceptions) {
      const problems = validatePreviewEnvAdmission(exception.admission);
      expect(problems, `active exception ${exception.id}`).toEqual([]);
      expect(
        ['admitted', 'cleanup-pending', 'cleaned', 'orphaned'],
        `active exception ${exception.id} cleanupState`
      ).toContain(exception.cleanupState);
    }
  });
});
