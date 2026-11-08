// JOV-9854: golden-path receipts attribute a missing browser check to deploy
// skew when the served build's smoke never implemented it. Split from
// prod-cert.test.mjs (size-500).
import { describe, expect, it } from 'vitest';
import { loadCertSteps } from '../../prod-cert.mjs';
import { runProductionCertification } from '../prod-cert.mjs';
import { PEN_IDS } from './fixtures/pen-green-env.mjs';
import { fakeFetch, SHA, T } from './fixtures/prod-cert-fakes.mjs';

describe('JOV-9854 deploy-skew attribution', () => {
  const step = (surface, id, status = 'passed') => ({
    surface,
    id,
    status,
    startedAt: T,
    endedAt: T,
    summary: status,
  });
  const capabilities = (surface, ids) => ({
    kind: 'capabilities',
    surface,
    ids,
  });

  it('a served build that predates a browser check stays blocked and says so', async () => {
    // Run 41130700812 (prod d381cd0c): the smoke ran, but the served build's
    // spec predated fresh-user-onboarding-first-value and
    // profile-edit-save-readback, so those two journeys read "blocked".
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      producerSourceSha: SHA,
      steps: [
        capabilities('onboarding', ['dashboard-first-value']),
        step('onboarding', 'dashboard-first-value'),
        capabilities('public-profile', ['owned-profile-renders-publicly']),
        step('public-profile', 'owned-profile-renders-publicly'),
      ],
    });
    const onboarding = receipts.find(r => r.surface === 'onboarding');
    expect(onboarding.status).toBe('blocked'); // never weakened to passed
    const predated = onboarding.checks.find(
      c => c.id === 'fresh-user-onboarding-first-value'
    );
    expect(predated.status).toBe('blocked');
    expect(predated.summary).toContain('served build predates');
    expect(predated.summary).toContain('fresh-user-onboarding-first-value');
    const publicProfile = receipts.find(r => r.surface === 'public-profile');
    expect(publicProfile.status).toBe('blocked');
    expect(
      publicProfile.checks.find(c => c.id === 'profile-edit-save-readback')
        .summary
    ).toContain('served build predates');
  });

  it('an implemented check that is absent from the steps still reads as not run', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      producerSourceSha: SHA,
      steps: [
        capabilities('onboarding', [
          'dashboard-first-value',
          'fresh-user-onboarding-first-value',
        ]),
      ],
    });
    const onboarding = receipts.find(r => r.surface === 'onboarding');
    expect(onboarding.status).toBe('blocked');
    expect(
      onboarding.checks.find(c => c.id === 'fresh-user-onboarding-first-value')
        .summary
    ).toContain('browser step did not run (auth smoke passed)');
  });

  it('without declared capabilities the legacy blocked summary is unchanged', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      steps: [],
    });
    const onboarding = receipts.find(r => r.surface === 'onboarding');
    expect(
      onboarding.checks.find(c => c.id === 'dashboard-first-value').summary
    ).toBe('browser step did not run (auth smoke passed)');
  });

  it('a capabilities step never becomes a check', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      steps: [
        capabilities('onboarding', ['dashboard-first-value']),
        capabilities('bogus-surface', ['x']),
        { kind: 'unknown-kind', surface: 'chat', junk: true },
      ],
    });
    for (const receipt of receipts) {
      for (const c of receipt.checks) {
        expect(typeof c.id).toBe('string');
        expect(['passed', 'failed', 'blocked', 'skipped']).toContain(c.status);
      }
    }
    const onboarding = receipts.find(r => r.surface === 'onboarding');
    expect(onboarding.checks.map(c => c.id)).toEqual([
      ...PEN_IDS,
      'dashboard-first-value',
      'fresh-user-onboarding-first-value',
    ]);
  });

  it('capabilities from two specs declaring the same surface are unioned', async () => {
    // smoke-prod-auth and prod-cert-start-chat both declare `claim` from
    // different Playwright workers; neither declaration may clobber the other.
    // Under last-write-wins, claimed-profile-owned (first spec only) would
    // lose its declaration and read "served build predates"; the union keeps
    // every declared check on the implemented-but-absent ("did not run") path.
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      producerSourceSha: SHA,
      steps: [
        capabilities('claim', ['claimed-profile-owned']),
        capabilities('claim', [
          'start-chat-first-reply',
          'golden-path-preview-has-release',
        ]),
      ],
    });
    const claim = receipts.find(r => r.surface === 'claim');
    expect(claim.status).toBe('blocked');
    for (const id of [
      'claimed-profile-owned',
      'start-chat-first-reply',
      'golden-path-preview-has-release',
    ]) {
      expect(claim.checks.find(c => c.id === id).summary).toBe(
        'browser step did not run (auth smoke passed)'
      );
    }
  });

  it('loadCertSteps: missing/empty is zero steps, corrupt is a loud failure', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-cert-steps-'));
    try {
      expect(loadCertSteps(undefined)).toEqual([]);
      expect(loadCertSteps(path.join(dir, 'missing.jsonl'))).toEqual([]);
      expect(() => loadCertSteps(dir)).toThrow();
      const empty = path.join(dir, 'empty.jsonl');
      fs.writeFileSync(empty, '');
      expect(loadCertSteps(empty)).toEqual([]);
      const corrupt = path.join(dir, 'corrupt.jsonl');
      fs.writeFileSync(corrupt, '{"kind":"telemetry", broken');
      expect(() => loadCertSteps(corrupt)).toThrow(
        /exists but is not valid JSON/
      );
      const notArray = path.join(dir, 'object.json');
      fs.writeFileSync(notArray, '{"receipts":[]}');
      expect(() => loadCertSteps(notArray)).toThrow(/JSON array/);
      const good = path.join(dir, 'good.json');
      fs.writeFileSync(good, '[{"surface":"chat","id":"composer-ready"}]');
      expect(loadCertSteps(good)).toEqual([
        { surface: 'chat', id: 'composer-ready' },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
