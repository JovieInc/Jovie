import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  auditFeedbackLinkage,
  lessonFingerprints,
  verifyFeedbackLinkage,
} from './feedback-linkage.mjs';
import {
  buildHarnessReceipt,
  HARNESS_CONTRACT_INVARIANT_ID,
  HARNESS_RECEIPT_SCHEMA,
  validateHarnessContract,
} from './harness-contract.mjs';
import { readInvariantRegistry } from './registry.mjs';

const canonical = readInvariantRegistry();
const NOW = '2026-09-03';

function clone() {
  return structuredClone(canonical);
}

function harnessInvariant(registry) {
  const invariant = registry.invariants.find(
    item => item.id === HARNESS_CONTRACT_INVARIANT_ID
  );
  assert.ok(invariant, `missing ${HARNESS_CONTRACT_INVARIANT_ID}`);
  return invariant;
}

function harnessPrinciple(registry, id) {
  const principle = harnessInvariant(registry).policy.value.principles.find(
    item => item.id === id
  );
  assert.ok(principle, `missing principle ${id}`);
  return principle;
}

// Injected file system that satisfies every gate/fixture binding except the
// one a deliberate-red case deliberately breaks.
const FIXTURE_TEXT = harnessInvariant(canonical)
  .policy.value.principles.map(principle => principle.deliberateRed.name)
  .join('\n');

function passFs(overrides = {}) {
  return {
    fileExists: () => true,
    readFile: () => FIXTURE_TEXT,
    now: NOW,
    ...overrides,
  };
}

describe('JOV-INV-024 harness contract', () => {
  it('accepts the checked-in harness contract', () => {
    assert.deepEqual(validateHarnessContract(canonical, { now: NOW }), []);
  });

  it('emits a deterministic zero-overhead receipt', () => {
    const first = buildHarnessReceipt(canonical, { now: NOW });
    const second = buildHarnessReceipt(canonical, { now: NOW });
    assert.deepEqual(first, second);
    assert.equal(first.schema, HARNESS_RECEIPT_SCHEMA);
    assert.equal(first.invariant, HARNESS_CONTRACT_INVARIANT_ID);
    assert.equal(first.principles, 9);
    assert.equal(first.enforced, 3);
    assert.equal(first.partial, 6);
    assert.deepEqual(first.overhead, {
      addedProcesses: 0,
      addedCiJobs: 0,
      apiCalls: 0,
      llmCalls: 0,
      dollarCost: 0,
    });
    for (const exception of first.exceptions) {
      assert.match(exception.exception, /^H-EX-0[1-9]$/);
      assert.equal(exception.owner, 'Summer');
      assert.match(exception.expires, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(exception.nextAction.length > 0);
    }
  });

  it('deliberate red H-01: a dropped bounded-repo-map principle fails closed', () => {
    const registry = clone();
    const policy = harnessInvariant(registry).policy.value;
    policy.principles = policy.principles.filter(item => item.id !== 'H-01');
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-principle-missing: H-01'))
    );
    assert.ok(errors.some(error => error.includes('harness-principles-count')));
  });

  it('deliberate red H-02: a principle without an event trigger fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-02').trigger.event = '';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error =>
        error.includes('harness-principle-incomplete:H-02:trigger.event')
      )
    );
  });

  it('deliberate red H-03: non-Summer policy ownership fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-03').policyOwner = 'Symphony';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-policy-owner:H-03'))
    );
  });

  it('deliberate red H-04: a gate path that does not exist fails closed', () => {
    const registry = clone();
    // A local (untagged) gate: cross-repo gates are verified by their owning repo.
    harnessPrinciple(registry, 'H-04').gate = {
      path: 'scripts/does-not-exist.mjs',
    };
    const errors = validateHarnessContract(
      registry,
      passFs({ fileExists: path => path !== 'scripts/does-not-exist.mjs' })
    );
    assert.ok(
      errors.some(error => error.includes('harness-gate-missing:H-04'))
    );
  });

  it('skips gates owned by another repo', () => {
    const registry = clone();
    const errors = validateHarnessContract(
      registry,
      passFs({ fileExists: path => !path.startsWith('scripts/symphony/') })
    );
    assert.ok(
      !errors.some(error => error.includes('harness-gate-missing:H-04'))
    );
  });

  it('deliberate red H-05: an unbound deliberate-red fixture fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-05').deliberateRed.name =
      'deliberate red H-05: a renamed fixture test fails closed';
    const errors = validateHarnessContract(
      registry,
      passFs({ readFile: () => 'unrelated fixture content' })
    );
    assert.ok(
      errors.some(error => error.includes('harness-deliberate-red:H-05'))
    );
  });

  it('deliberate red H-06: a receipt without the deterministic command fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-06').receipt = 'pnpm invariants:check';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(errors.some(error => error.includes('harness-receipt:H-06')));
  });

  it('deliberate red H-07: an unknown principle status fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-07').status = 'aspirational';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(errors.some(error => error.includes('harness-status:H-07')));
  });

  it('deliberate red H-08: a partial principle without an exception fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-08').exception = null;
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-exception-missing:H-08'))
    );
  });

  it('deliberate red H-09: an enforced principle carrying an exception fails closed', () => {
    const registry = clone();
    harnessPrinciple(registry, 'H-09').status = 'enforced';
    const errors = validateHarnessContract(registry, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-exception-unexpected:H-09'))
    );
  });

  it('deliberate red: an expired exception fails closed and a live one passes', () => {
    const expired = clone();
    harnessPrinciple(expired, 'H-02').exception.expires = '2026-08-01';
    const errors = validateHarnessContract(expired, passFs());
    assert.ok(
      errors.some(error => error.includes('harness-exception-expired:H-02'))
    );

    const live = clone();
    harnessPrinciple(live, 'H-02').exception.expires = '2026-09-30';
    assert.deepEqual(validateHarnessContract(live, passFs()), []);

    const wrongOwner = clone();
    harnessPrinciple(wrongOwner, 'H-02').exception.owner = 'Gem';
    assert.ok(
      validateHarnessContract(wrongOwner, passFs()).some(error =>
        error.includes('harness-exception-owner:H-02')
      )
    );
  });
});

// Fixed fixtures exercise the verifier without turning the live ledger into a
// new blocking delivery gate. The existing validate process emits its shadow audit.
const lessonSource =
  '### Executable guard\n**Mistake:** Repeated bug.\n### Policy guard\n**Mistake:** Repeated policy mistake.\n';
const guardFixtures = {
  'example.test.ts': 'it rejects the repeated failure deterministically',
  '.claude/rules/example.md':
    'Require a reviewed receipt before the external action',
};
const readLocalGuard = path => {
  assert.ok(Object.hasOwn(guardFixtures, path), 'missing fixture guard');
  return guardFixtures[path];
};
const feedbackRegistry = {
  schema: 'jovie.feedback-guards/v1',
  reviewedOn: '2026-10-01',
  lessons: lessonFingerprints(lessonSource).map((lesson, index) => ({
    ...lesson,
    guards: [
      {
        kind: index === 0 ? 'test' : 'scoped-rule',
        path: Object.keys(guardFixtures)[index],
        anchor: Object.values(guardFixtures)[index],
        reason:
          'A reviewed and specific prevention reference for this fixture.',
      },
    ],
  })),
};

describe('H-06 repeated-feedback linkage', () => {
  it('validates both executable and policy linkage without equating them', () => {
    const lessons = verifyFeedbackLinkage(
      lessonSource,
      feedbackRegistry,
      readLocalGuard
    );
    assert.equal(lessons.length, 2);
    assert.deepEqual(
      lessons.map(lesson => lesson.guards[0].kind),
      ['test', 'scoped-rule']
    );
  });

  it('reports live ledger failures in qualification without throwing or claiming prevention', () => {
    const root = mkdtempSync(join(tmpdir(), 'feedback-qualification-'));
    try {
      writeFileSync(join(root, 'LESSONS.md'), lessonSource);
      writeFileSync(
        join(root, 'LESSONS.guards.json'),
        JSON.stringify(feedbackRegistry)
      );
      for (const [path, content] of Object.entries(guardFixtures)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
      }
      const good = auditFeedbackLinkage(root);
      assert.equal(good.mode, 'qualification-only');
      assert.equal(good.ok, true);
      assert.equal(good.lessonCount, 2);
      assert.equal(good.testLinks, 1);
      assert.equal(good.ruleLinks, 1);
      assert.deepEqual(good.policyOnlyFingerprints, ['Policy guard']);
      assert.equal(good.cannotRecur, 0);
      assert.ok(good.durationMs >= 0);
      writeFileSync(
        join(root, 'LESSONS.md'),
        `${lessonSource}### Unreviewed lesson\nNew failure.\n`
      );
      const drift = auditFeedbackLinkage(root);
      assert.equal(drift.ok, false);
      assert.match(drift.findings[0], /non-exhaustive/);
      assert.deepEqual(drift.lessons, []);
      writeFileSync(join(root, 'LESSONS.md'), lessonSource);
      rmSync(join(root, 'example.test.ts'));
      const missing = auditFeedbackLinkage(root);
      assert.equal(missing.ok, false);
      assert.match(missing.findings[0], /ENOENT/);
      symlinkSync(
        join(root, '.claude/rules/example.md'),
        join(root, 'example.test.ts')
      );
      assert.match(auditFeedbackLinkage(root).findings[0], /symlink/);
      writeFileSync(join(root, 'LESSONS.guards.json'), '{');
      assert.equal(auditFeedbackLinkage(root).ok, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('deliberate red H-06: new, removed, duplicated or edited lessons require review', () => {
    for (const source of [
      `${lessonSource}\n### Newly repeated mistake\nNeeds prevention.\n`,
      lessonSource.replace(/^### .+\n/mu, ''),
      `${lessonSource}\n${lessonSource}`,
      lessonSource.replace('**Mistake:**', '**Mistake:** newly corrected'),
    ]) {
      assert.throws(() =>
        verifyFeedbackLinkage(source, feedbackRegistry, readLocalGuard)
      );
    }
    assert.throws(
      () => verifyFeedbackLinkage('', feedbackRegistry, readLocalGuard),
      /no lesson/
    );
  });

  it('deliberate red H-06: stale, missing, circular or nominal guards cannot pass', () => {
    const mutations = [
      entry => {
        entry.guards = [];
      },
      entry => {
        entry.guards[0].anchor = 'a nonexistent test or rule anchor';
      },
      entry => {
        entry.guards[0].anchor = 'test';
      },
      entry => {
        entry.guards[0].reason = '';
      },
      entry => {
        entry.guards[0].kind = 'cannot-recur';
      },
      entry => {
        entry.guards[0].path = '../outside.test.ts';
      },
      entry => {
        entry.guards[0].path = '/outside.test.ts';
      },
      entry => {
        entry.guards[0].path = 'apps/../outside.test.ts';
      },
      entry => {
        entry.guards[0].path = 'C:\\outside.test.ts';
      },
      entry => {
        entry.guards[0].path = 'LESSONS.md';
      },
      entry => {
        entry.guards[0].path = 'scripts/invariants/harness-contract.test.mjs';
      },
      entry => {
        entry.guards[0].kind = 'scoped-rule';
      },
      entry => {
        entry.guards.push(entry.guards[0]);
      },
    ];
    for (const mutate of mutations) {
      const registry = structuredClone(feedbackRegistry);
      mutate(registry.lessons[0]);
      assert.throws(() =>
        verifyFeedbackLinkage(lessonSource, registry, readLocalGuard)
      );
    }
    assert.throws(
      () =>
        verifyFeedbackLinkage(lessonSource, feedbackRegistry, () => {
          throw new Error('missing file');
        }),
      /missing file/
    );
  });

  it('deliberate red H-06: duplicate and orphaned registry entries fail', () => {
    const duplicate = structuredClone(feedbackRegistry);
    duplicate.lessons.push(duplicate.lessons[0]);
    assert.throws(
      () => verifyFeedbackLinkage(lessonSource, duplicate, readLocalGuard),
      /duplicate linkage/
    );
    const orphan = structuredClone(feedbackRegistry);
    orphan.lessons[0].fingerprint = 'Removed lesson';
    assert.throws(
      () => verifyFeedbackLinkage(lessonSource, orphan, readLocalGuard),
      /non-exhaustive/
    );
  });

  it('handles CRLF and fenced example headings without dropping real lessons', () => {
    assert.deepEqual(
      lessonFingerprints(lessonSource.replaceAll('\n', '\r\n')),
      lessonFingerprints(lessonSource)
    );
    assert.deepEqual(
      lessonFingerprints('   ### Indented lesson\nBody.').map(
        item => item.fingerprint
      ),
      ['Indented lesson']
    );
    for (const fence of ['```', '~~~~']) {
      const source = `### Real lesson\nBefore.\n${fence}md\n### Example only\n${fence}\nAfter.\n## Category\n### Next lesson\nBody.\n`;
      assert.deepEqual(
        lessonFingerprints(source).map(item => item.fingerprint),
        ['Real lesson', 'Next lesson']
      );
      assert.throws(
        () => lessonFingerprints(`### Real\n${fence}\nnever closed`),
        /unclosed/
      );
    }
  });
});
