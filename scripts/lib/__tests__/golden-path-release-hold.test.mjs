import { describe, expect, it, vi } from 'vitest';
import {
  applyReleaseHold,
  decideReleaseHold,
  holdFingerprint,
  holdSummaryLines,
} from '../golden-path-release-hold.mjs';
import { SURFACE_IDS } from '../prod-cert.mjs';

const candidate = 'a'.repeat(40);
const scoped = steps => ({ all: false, steps, why: {}, reason: null });
const unknown = {
  all: true,
  steps: [...SURFACE_IDS],
  why: {},
  reason: 'a changed path is not placed in any step',
};
const passed = { status: 'passed', sha: candidate, runUrl: 'https://run/1' };
const failed = { status: 'failed', sha: candidate, runUrl: 'https://run/2' };
const allPassing = () =>
  Object.fromEntries(SURFACE_IDS.map(id => [id, { ...passed }]));
const [stepA, stepB] = SURFACE_IDS;

describe('decideReleaseHold', () => {
  it('does not hold when only an untouched step is failing', () => {
    const certs = { ...allPassing(), [stepB]: failed };
    const d = decideReleaseHold({
      candidateSha: candidate,
      touched: scoped([stepA]),
      certifications: certs,
    });
    expect(d.decision).toBe('promote');
    expect(d.held).toEqual([]);
  });

  it('holds when a touched step is failing', () => {
    const certs = { ...allPassing(), [stepA]: failed };
    const d = decideReleaseHold({
      candidateSha: candidate,
      touched: scoped([stepA]),
      certifications: certs,
    });
    expect(d.decision).toBe('hold');
    expect(d.held.map(h => h.step)).toEqual([stepA]);
  });

  it('holds a touched step with no certification for the release', () => {
    const certs = { ...allPassing() };
    delete certs[stepA];
    const d = decideReleaseHold({
      candidateSha: candidate,
      touched: scoped([stepA]),
      certifications: certs,
    });
    expect(d.decision).toBe('hold');
    expect(d.held[0].why).toMatch(/no certification/);
  });

  it('treats unknown scope as every step touched', () => {
    const certs = { ...allPassing(), [stepB]: failed };
    const d = decideReleaseHold({
      candidateSha: candidate,
      touched: unknown,
      certifications: certs,
    });
    expect(d.decision).toBe('hold');
    expect(d.held.map(h => h.step)).toEqual([stepB]);
  });

  it('fails closed when scope or certifications are unreadable', () => {
    const d = decideReleaseHold({
      candidateSha: candidate,
      touched: null,
      certifications: null,
    });
    expect(d.decision).toBe('hold');
    expect(d.held).toHaveLength(SURFACE_IDS.length);
  });

  it('promotes when every touched step passed on the candidate', () => {
    const d = decideReleaseHold({
      candidateSha: candidate,
      touched: scoped([stepA, stepB]),
      certifications: allPassing(),
    });
    expect(d.decision).toBe('promote');
  });

  it('does not accept a pass on a different release', () => {
    const certs = {
      ...allPassing(),
      [stepA]: { ...passed, sha: 'b'.repeat(40) },
    };
    const d = decideReleaseHold({
      candidateSha: candidate,
      touched: scoped([stepA]),
      certifications: certs,
    });
    expect(d.decision).toBe('hold');
  });
});

describe('applyReleaseHold', () => {
  const holdFor = step =>
    decideReleaseHold({
      candidateSha: candidate,
      touched: scoped([step]),
      certifications: { ...allPassing(), [step]: failed },
    });

  it('upserts one release-hold:<step> issue per held step', async () => {
    const upsert = vi.fn(async () => ({
      ok: true,
      action: 'created',
      identifier: 'JOV-1',
    }));
    const r = await applyReleaseHold(holdFor(stepA), { upsert });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].fingerprint).toBe(`release-hold:${stepA}`);
    expect(upsert.mock.calls[0][0].title).toContain(`release-hold:${stepA}`);
    expect(holdFingerprint(stepA)).toBe(`release-hold:${stepA}`);
    expect(r.issues[0]).toMatchObject({ step: stepA, ok: true });
  });

  it('does not call Linear when promoting', async () => {
    const upsert = vi.fn();
    const d = decideReleaseHold({
      candidateSha: candidate,
      touched: scoped([stepA]),
      certifications: allPassing(),
    });
    const r = await applyReleaseHold(d, { upsert });
    expect(upsert).not.toHaveBeenCalled();
    expect(r.issues).toEqual([]);
  });

  it('keeps the hold and says so when the issue cannot be opened', async () => {
    const upsert = vi.fn(async () => {
      throw new Error('linear down');
    });
    const r = await applyReleaseHold(holdFor(stepA), { upsert });
    expect(r.decision).toBe('hold');
    expect(r.issues[0]).toMatchObject({ step: stepA, ok: false });
    expect(holdSummaryLines(r).join('\n')).toMatch(/NOT opened/);
  });

  it('shows the hold and the issue in the summary', async () => {
    const upsert = async () => ({
      ok: true,
      action: 'updated',
      identifier: 'JOV-9',
    });
    const r = await applyReleaseHold(holdFor(stepA), { upsert });
    const text = holdSummaryLines(r).join('\n');
    expect(text).toContain('HELD');
    expect(text).toContain(stepA);
    expect(text).toContain('JOV-9');
  });
});
