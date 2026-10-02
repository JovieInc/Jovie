import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// H-06 linkage belongs to the existing harness audit. This is source-reference
// evidence, not a claim that every linked test ran or every policy is automated.
export function lessonFingerprints(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const lessons = [];
  let fence = null;
  let start = null;
  function finish(end) {
    if (start !== null) {
      lessons.push({
        fingerprint: lines[start].trimStart().slice(4),
        lessonSha256: sha256(lines.slice(start, end).join('\n').trim()),
      });
      start = null;
    }
  }
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (
        marker?.[0] === fence[0] &&
        marker.length >= fence.length &&
        line.trim() === marker
      )
        fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    if (/^ {0,3}#{1,3} /u.test(line)) {
      finish(index);
      if (line.trimStart().startsWith('### ')) start = index;
    }
  }
  assert.equal(fence, null, 'unclosed lesson fence');
  finish(lines.length);
  return lessons;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function verifyFeedbackLinkage(markdown, registry, readGuard) {
  assert.equal(registry.schema, 'jovie.feedback-guards/v1', 'linkage schema');
  assert.match(registry.reviewedOn, /^\d{4}-\d{2}-\d{2}$/u, 'review date');
  const lessons = lessonFingerprints(markdown);
  assert.ok(lessons.length > 0, 'no lesson fingerprints');
  const names = lessons.map(lesson => lesson.fingerprint);
  assert.equal(
    new Set(names).size,
    names.length,
    'duplicate lesson fingerprint'
  );
  assert.ok(Array.isArray(registry.lessons), 'missing lesson inventory');
  const registered = registry.lessons.map(lesson => lesson.fingerprint);
  assert.equal(
    new Set(registered).size,
    registered.length,
    'duplicate linkage'
  );
  assert.deepEqual(
    [...registered].sort(),
    [...names].sort(),
    'non-exhaustive linkage'
  );
  return lessons.map(lesson => {
    const entry = registry.lessons.find(
      item => item.fingerprint === lesson.fingerprint
    );
    assert.equal(
      entry.lessonSha256,
      lesson.lessonSha256,
      `review changed lesson: ${lesson.fingerprint}`
    );
    assert.ok(entry.guards?.length > 0, `missing guard: ${lesson.fingerprint}`);
    const identities = new Set();
    const guards = entry.guards.map(guard => {
      assert.ok(
        ['test', 'scoped-rule'].includes(guard.kind),
        'unsupported guard kind'
      );
      assert.equal(typeof guard.path, 'string', 'missing guard path');
      assert.equal(
        posix.normalize(guard.path),
        guard.path,
        'noncanonical guard path'
      );
      assert.ok(
        !/^(?:\/|\.\.\/)|\\|:/u.test(guard.path),
        'nonlocal guard path'
      );
      if (guard.kind === 'test') {
        assert.match(
          guard.path,
          /\.(?:test|spec)\.[cm]?[jt]sx?$/u,
          'guard must name a test'
        );
        assert.notEqual(
          guard.path,
          'scripts/invariants/harness-contract.test.mjs',
          'circular linkage'
        );
      } else {
        assert.match(
          guard.path,
          /^\.claude\/rules\/[^/]+\.md$/u,
          'guard must name a scoped rule'
        );
      }
      assert.ok(
        typeof guard.anchor === 'string' && guard.anchor.trim().length >= 16,
        'specific guard anchor required'
      );
      assert.ok(
        typeof guard.reason === 'string' && guard.reason.trim().length >= 24,
        'guard rationale required'
      );
      const identity = `${guard.path}#${guard.anchor}`;
      assert.ok(!identities.has(identity), 'duplicate guard');
      identities.add(identity);
      const source = readGuard(guard.path).replaceAll('\r\n', '\n');
      assert.ok(
        source.includes(guard.anchor),
        `missing guard anchor: ${identity}`
      );
      return { ...guard, sourceSha256: sha256(source) };
    });
    return { ...lesson, guards };
  });
}

/** Source linkage qualification, never a replacement for existing gate errors. */
export function auditFeedbackLinkage(
  repoRoot = fileURLToPath(new URL('../../', import.meta.url))
) {
  const started = performance.now();
  const receipt = {
    schema: 'jovie.feedback-linkage-qualification/v1',
    mode: 'qualification-only',
    proof: 'reviewed-source-linkage-only',
    cannotRecur: 0,
    ok: false,
    findings: [],
    lessonCount: 0,
    testLinks: 0,
    ruleLinks: 0,
    policyOnlyFingerprints: [],
    lessons: [],
  };
  try {
    const root = realpathSync(repoRoot);
    const readLocal = path => {
      const absolute = resolve(root, path);
      assert.equal(
        realpathSync(absolute),
        absolute,
        'guard path must not traverse a symlink'
      );
      return readFileSync(absolute, 'utf8');
    };
    const lessons = verifyFeedbackLinkage(
      readLocal('LESSONS.md'),
      JSON.parse(readLocal('LESSONS.guards.json')),
      readLocal
    );
    const guards = lessons.flatMap(lesson => lesson.guards);
    Object.assign(receipt, {
      ok: true,
      lessonCount: lessons.length,
      testLinks: guards.filter(guard => guard.kind === 'test').length,
      ruleLinks: guards.filter(guard => guard.kind === 'scoped-rule').length,
      policyOnlyFingerprints: lessons
        .filter(lesson =>
          lesson.guards.every(guard => guard.kind === 'scoped-rule')
        )
        .map(lesson => lesson.fingerprint),
      lessons,
    });
  } catch (error) {
    receipt.findings.push(error.message);
  }
  return { ...receipt, durationMs: performance.now() - started };
}
