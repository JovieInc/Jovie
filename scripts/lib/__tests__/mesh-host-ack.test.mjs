import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import fs, {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import {
  acknowledgeDispatch,
  sealWorkOrder,
} from '../../../packages/agent-transport-contracts/work-order.ts';
import { createMeshHostAcknowledgments } from '../../lanes/mesh-host-ack.mjs';

const canonical = value =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value !== null && typeof value === 'object'
      ? `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
          .join(',')}}`
      : JSON.stringify(value);
const key = 'a'.repeat(64);
const action = 'reconcile-native-queue-starvation';
const first = '2026-10-09T01:00:00.000Z',
  projected = '2026-10-09T01:01:00.000Z';
const sealed = '2026-10-09T01:02:00.000Z',
  handedOff = '2026-10-09T01:03:00.000Z';
const clock = Date.parse('2026-10-09T01:04:00.000Z');
const order = () =>
  sealWorkOrder({
    schema: 'jovie.work-order/v1',
    orderId: 'child-order',
    revision: 2,
    idempotencyKey: 'child_order_1',
    gate: { objectiveRef: 'JOV-5853', gateId: 'repair-gate' },
    state: 'open',
    title: 'Bounded child',
    outcome: 'Restore selected check',
    successPredicate: {
      id: 'selected-check',
      statement: 'Selected check succeeds',
      verifier: 'ci',
    },
    requiredCapabilities: ['code-change'],
    riskTier: 'low',
    authorityClass: 'automation',
    scope: { target: 'JovieInc/Jovie', entityRefs: ['JOV-6001'] },
    evidence: [],
    permittedActions: [action, 'bind-projected-child'],
    forbiddenActions: ['outbound', 'spend'],
    budget: {
      deadline: '2026-10-09T02:00:00.000Z',
      maxAttempts: 1,
      maxSpendUsd: 0,
      maxConcurrency: 1,
      founderMinutes: 0,
    },
    stopConditions: ['Owner admission unavailable'],
    escalation: { owner: 'Summer', action: 'Read exact owner hold' },
    expectedArtifact: {
      kind: 'pull-request',
      description: 'Exact bounded patch',
    },
    founderAsk: null,
    replyTo: { kind: 'linear-comment', ref: 'JOV-6001' },
    createdAt: sealed,
    createdBy: 'Summer',
  });
function binding() {
  const child = order();
  return {
    taskKey: key,
    action,
    requester: { runtime: 'summer', ownerId: 'original-summer', taskRef: key },
    recipient: { runtime: 'symphony', ownerId: 'original-host', taskRef: key },
    order: child,
    dispatchAck: acknowledgeDispatch(child, {
      transportRef: 'child-order:' + key,
      dispatchedAt: handedOff,
    }),
    lineage: {
      parentRecordedAt: first,
      callerIntentRecordedAt: first,
      dispatchObservedAt: first,
      projectionCompletedAt: projected,
      parentOrderDigest: 'b'.repeat(64),
      sourceVersion: 'c'.repeat(40),
      snapshotDigest: 'd'.repeat(64),
    },
  };
}
function fixture({ disposition = 'accepted' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'mesh-host-ack-'));
  chmodSync(directory, 0o700);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  let current = binding(),
    state = 'active',
    calls = 0,
    now = clock;
  // Test-only signed proof envelope. There is deliberately no production wire
  // domain or configured key registry in the host module. This real verifier
  // models the existing-authority adapter and its CURRENT immutable owner map.
  const proof = (
    body = current,
    receiptRef = undefined,
    operation = 'receive',
    signer = privateKey
  ) => {
    const signed = {
      body: structuredClone(body),
      operation,
      ...(receiptRef === undefined ? {} : { receiptRef }),
    };
    return {
      signed,
      signature: sign(null, Buffer.from(canonical(signed)), signer).toString(
        'base64url'
      ),
    };
  };
  const verifyAuthority = async (request, operation) => {
    if (
      !verify(
        null,
        Buffer.from(canonical(request.signed)),
        publicKey,
        Buffer.from(request.signature, 'base64url')
      )
    )
      throw Error('test-owner-signature-invalid');
    if (
      request.signed.operation !== operation ||
      state !== 'active' ||
      canonical(request.signed.body) !== canonical(current)
    )
      throw Error('test-current-owner-binding-invalid');
    if (request.receiptRef !== request.signed.receiptRef)
      throw Error('test-receipt-selector-invalid');
    return structuredClone(current);
  };
  const withOwnerLock = async (taskKey, fn) => {
    assert.equal(taskKey, key);
    if (state !== 'active') throw Error('test-binding-revoked');
    const path = join(directory, 'owner.lock');
    const fd = openSync(path, 'wx', 0o600);
    try {
      return await fn();
    } finally {
      closeSync(fd);
      unlinkSync(path);
    }
  };
  const deps = {
    directory,
    verifyAuthority,
    withOwnerLock,
    prospectiveSince: first,
    now: () => now,
    decideRecipientAdmission: async () => {
      calls++;
      return { disposition };
    },
  };
  const receive = () => createMeshHostAcknowledgments(deps).receive(proof());
  const read = receiptRef => {
    const request = proof(current, receiptRef, 'read');
    request.receiptRef = receiptRef;
    return createMeshHostAcknowledgments(deps).readOwnedTaskAcknowledgment(
      request
    );
  };
  return {
    directory,
    deps,
    proof,
    receive,
    read,
    get calls() {
      return calls;
    },
    setCurrent: value => {
      current = value;
    },
    setState: value => {
      state = value;
    },
    setTime: value => {
      now = value;
    },
    receiptPath: join(directory, `${key}.json`),
    intentPath: join(directory, `${key}.intent.json`),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
async function using(fn, options) {
  const f = fixture(options);
  try {
    await fn(f);
  } finally {
    f.cleanup();
  }
}

test('unconfigured verifier, lifecycle lock and recipient capability fail closed without storage', async () => {
  await assert.rejects(
    createMeshHostAcknowledgments().receive({}),
    /recipient-unconfigured/
  );
  await assert.rejects(
    createMeshHostAcknowledgments().readOwnedTaskAcknowledgment({}),
    /authority-unconfigured/
  );
  await using(async f => {
    for (const missing of [
      'verifyAuthority',
      'withOwnerLock',
      'decideRecipientAdmission',
    ]) {
      const deps = { ...f.deps, [missing]: undefined };
      await assert.rejects(
        createMeshHostAcknowledgments(deps).receive(f.proof()),
        /unconfigured/
      );
      assert.equal(existsSync(f.intentPath), false);
      assert.equal(f.calls, 0);
    }
  });
});
test('genuine decision persists separately from canonical dispatch and exact authenticated replay is immutable', async () => {
  for (const disposition of ['accepted', 'rejected', 'deferred'])
    await using(
      async f => {
        const evidence = await f.receive();
        const bytes = readFileSync(f.receiptPath);
        assert.equal(evidence.acknowledgment.disposition, disposition);
        assert.equal(evidence.dispatchAck.disposition, 'deferred');
        assert.equal(evidence.dispatchAck.outcome.status, 'unknown');
        assert.equal(evidence.dispatchAck.certification.status, 'uncertified');
        assert.deepEqual(
          await f.read(evidence.acknowledgment.receiptRef),
          evidence
        );
        f.setTime(clock + 60000);
        assert.deepEqual(await f.receive(), evidence);
        assert.deepEqual(readFileSync(f.receiptPath), bytes);
        assert.equal(f.calls, 1);
      },
      { disposition }
    );
});
test('real cryptographic verification rejects tampering, another signer and read selector spoofing', async () =>
  using(async f => {
    const bad = f.proof();
    bad.signed.body.recipient.ownerId = 'other-host';
    await assert.rejects(
      createMeshHostAcknowledgments(f.deps).receive(bad),
      /signature-invalid/
    );
    const other = generateKeyPairSync('ed25519');
    await assert.rejects(
      createMeshHostAcknowledgments(f.deps).receive(
        f.proof(binding(), undefined, 'receive', other.privateKey)
      ),
      /signature-invalid/
    );
    const evidence = await f.receive();
    const request = f.proof(
      binding(),
      evidence.acknowledgment.receiptRef,
      'read'
    );
    request.receiptRef = 'forged-ref';
    await assert.rejects(
      createMeshHostAcknowledgments(f.deps).readOwnedTaskAcknowledgment(
        request
      ),
      /selector-invalid/
    );
    assert.equal(f.calls, 1);
  }));
test('malformed/expired orders, historical timing, extra ACKs and noncanonical dispatch never reach recipient', async () =>
  using(async f => {
    const mutations = [
      b => {
        b.action = 'execute-existing-owned-repair';
      },
      b => {
        b.recipient.runtime = 'summer';
      },
      b => {
        b.requester.taskRef = 'other';
      },
      b => {
        b.order.revision = 1;
      },
      b => {
        b.order.scope.entityRefs = ['JOV-5853'];
      },
      b => {
        b.order.state = 'canceled';
      },
      b => {
        b.order.budget.maxSpendUsd = 1;
      },
      b => {
        b.order.budget.deadline = first;
      },
      b => {
        b.dispatchAck.disposition = 'accepted';
      },
      b => {
        b.dispatchAck.outcome.predicateId = 'other';
      },
      b => {
        b.dispatchAck.dispatchedAt = first;
      },
      b => {
        b.lineage.parentRecordedAt = sealed;
      },
      b => {
        b.lineage.sourceVersion = 'bad';
      },
      b => {
        b.acknowledgment = { disposition: 'accepted' };
      },
    ];
    for (const mutate of mutations) {
      const b = binding();
      mutate(b);
      f.setCurrent(b);
      await assert.rejects(
        createMeshHostAcknowledgments(f.deps).receive(f.proof(b))
      );
      assert.equal(existsSync(f.intentPath), false);
      assert.equal(f.calls, 0);
    }
  }));
test('restart after uncertain recipient decision never retries the decision or invents a receipt', async () =>
  using(async f => {
    f.deps.decideRecipientAdmission = async () => {
      throw Error('decision response lost');
    };
    await assert.rejects(f.receive(), /response lost/);
    f.deps.decideRecipientAdmission = async () => {
      throw Error('must never call twice');
    };
    await assert.rejects(f.receive(), /decision-unknown/);
    assert.equal(await f.read('unknown'), null);
    assert.equal(existsSync(f.receiptPath), false);
  }));
test('concurrent factories permit one genuine decision under the existing owner lock', async () =>
  using(async f => {
    /** @type {() => void} */
    let release = () => {
      throw Error('test-barrier-unconfigured');
    };
    const blocked = new Promise(resolve => {
      release = () => resolve(undefined);
    });
    f.deps.decideRecipientAdmission = async () => {
      await blocked;
      return { disposition: 'accepted' };
    };
    const firstCall = f.receive();
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(f.receive(), /EEXIST/);
    release();
    const evidence = await firstCall;
    assert.deepEqual(
      await f.read(evidence.acknowledgment.receiptRef),
      evidence
    );
  }));
test('unreadable/malformed/unsafe storage and wrong receipt prevent read success', async () =>
  using(async f => {
    const evidence = await f.receive();
    const original = readFileSync(f.receiptPath);
    await assert.rejects(f.read('wrong-ref'), /receipt-ref-mismatch/);
    chmodSync(f.receiptPath, 0o644);
    await assert.rejects(
      f.read(evidence.acknowledgment.receiptRef),
      /file-unsafe/
    );
    chmodSync(f.receiptPath, 0o600);
    writeFileSync(f.receiptPath, '{');
    await assert.rejects(f.receive(), SyntaxError);
    writeFileSync(f.receiptPath, original);
    const row = JSON.parse(original.toString('utf8'));
    row.evidence.acknowledgment.disposition = 'fabricated';
    writeFileSync(f.receiptPath, JSON.stringify(row));
    await assert.rejects(
      f.read(evidence.acknowledgment.receiptRef),
      /receipt-invalid/
    );
    unlinkSync(f.receiptPath);
    symlinkSync(f.intentPath, f.receiptPath);
    await assert.rejects(f.receive());
    assert.equal(f.calls, 1);
  }));
test('owner revocation, changed immutable binding and expiry remain holds after receipt exists', async () =>
  using(async f => {
    const evidence = await f.receive();
    f.setState('revoked');
    await assert.rejects(
      f.read(evidence.acknowledgment.receiptRef),
      /binding-invalid/
    );
    f.setState('active');
    const b = binding();
    b.lineage.parentOrderDigest = 'e'.repeat(64);
    f.setCurrent(b);
    await assert.rejects(f.receive(), /receipt-conflict/);
    f.setCurrent(binding());
    f.setTime(Date.parse('2026-10-09T03:00:00.000Z'));
    await assert.rejects(
      f.read(evidence.acknowledgment.receiptRef),
      /time-invalid/
    );
    assert.equal(f.calls, 1);
  }));
test('authority movement under lock and invalid recipient response retain uncertainty', async () =>
  using(async f => {
    const original = f.deps.withOwnerLock;
    f.deps.withOwnerLock = async (key, fn) =>
      original(key, async () => {
        f.setState('closed');
        return fn();
      });
    await assert.rejects(f.receive(), /binding-invalid/);
    assert.equal(existsSync(f.intentPath), false);
    f.setState('active');
    f.deps.withOwnerLock = original;
    f.deps.decideRecipientAdmission = async () => ({ accepted: true });
    await assert.rejects(f.receive(), /decision-invalid/);
    assert.equal(existsSync(f.intentPath), true);
  }));
test('unsafe directory and clock expiry during decision fail closed', async () =>
  using(async f => {
    chmodSync(f.directory, 0o755);
    await assert.rejects(f.receive(), /directory-unsafe/);
    chmodSync(f.directory, 0o700);
    f.deps.decideRecipientAdmission = async () => {
      f.setTime(Date.parse('2026-10-09T03:00:00.000Z'));
      return { disposition: 'accepted' };
    };
    await assert.rejects(f.receive(), /time-invalid/);
    assert.equal(existsSync(f.receiptPath), false);
  }));

test('post-decision revocation and historical children cannot manufacture receipts', async () => {
  await using(async f => {
    f.deps.decideRecipientAdmission = async () => {
      f.setState('revoked');
      return { disposition: 'accepted' };
    };
    await assert.rejects(f.receive(), /binding-invalid/);
    assert.equal(existsSync(f.intentPath), true);
    assert.equal(existsSync(f.receiptPath), false);
  });
  await using(async f => {
    f.deps.prospectiveSince = handedOff;
    await assert.rejects(f.receive(), /historical-child/);
    assert.equal(f.calls, 0);
    assert.equal(existsSync(f.intentPath), false);
  });
});
test('authenticated read selector is snapshotted before asynchronous verifier resumes', async () =>
  using(async f => {
    const evidence = await f.receive();
    const ref = evidence.acknowledgment.receiptRef;
    const request = f.proof(binding(), ref, 'read');
    request.receiptRef = ref;
    const original = f.deps.verifyAuthority;
    /** @type {() => void} */
    let reached = () => {
      throw Error('test-barrier-unconfigured');
    };
    /** @type {() => void} */
    let release = () => {
      throw Error('test-barrier-unconfigured');
    };
    const waiting = new Promise(resolve => {
      reached = () => resolve(undefined);
    });
    const blocked = new Promise(resolve => {
      release = () => resolve(undefined);
    });
    f.deps.verifyAuthority = async (...args) => {
      reached();
      await blocked;
      return original(...args);
    };
    const reading = createMeshHostAcknowledgments(
      f.deps
    ).readOwnedTaskAcknowledgment(request);
    await waiting;
    request.receiptRef = 'changed-after-authentication';
    release();
    assert.deepEqual(await reading, evidence);
  }));
test('receipt create uncertainty retains intent and cannot overwrite an existing record', async () =>
  using(async f => {
    const bytes = JSON.stringify({ foreign: 'receipt' });
    f.deps.decideRecipientAdmission = async () => {
      writeFileSync(f.receiptPath, bytes, { mode: 0o600 });
      return { disposition: 'accepted' };
    };
    await assert.rejects(f.receive(), /EEXIST/);
    assert.equal(existsSync(f.intentPath), true);
    assert.equal(readFileSync(f.receiptPath, 'utf8'), bytes);
    await assert.rejects(f.receive(), /receipt-conflict/);
  }));

test('invalid owner clock and invalid calendar lineage fail closed before admission', async () =>
  using(async f => {
    f.setTime(Number.NaN);
    await assert.rejects(f.receive(), /clock-invalid/);
    f.setTime(clock);
    const b = binding();
    b.lineage.parentRecordedAt = '2026-02-31T01:00:00.000Z';
    f.setCurrent(b);
    await assert.rejects(f.receive(), /time-invalid/);
    assert.equal(f.calls, 0);
    assert.equal(existsSync(f.intentPath), false);
  }));

test(
  'failed post-link directory sync stays unknown through restart/read until durability is proved',
  { concurrent: false },
  async () =>
    using(async f => {
      const original = fs.fsyncSync;
      let directorySyncs = 0;
      fs.fsyncSync = fd => {
        if (fs.fstatSync(fd).isDirectory() && ++directorySyncs >= 2)
          throw Error('test-directory-sync-uncertain');
        return original(fd);
      };
      syncBuiltinESMExports();
      let bytes;
      try {
        await assert.rejects(f.receive(), /directory-sync-uncertain/);
        assert.equal(f.calls, 1);
        assert.equal(existsSync(f.intentPath), true);
        assert.equal(existsSync(f.receiptPath), true);
        bytes = readFileSync(f.receiptPath);
        const ref = JSON.parse(bytes.toString('utf8')).evidence.acknowledgment
          .receiptRef;
        await assert.rejects(f.receive(), /directory-sync-uncertain/);
        await assert.rejects(f.read(ref), /directory-sync-uncertain/);
        assert.equal(f.calls, 1);
        assert.deepEqual(readFileSync(f.receiptPath), bytes);
      } finally {
        fs.fsyncSync = original;
        syncBuiltinESMExports();
      }
      const retained = JSON.parse(bytes.toString('utf8')).evidence;
      assert.deepEqual(
        await f.read(retained.acknowledgment.receiptRef),
        retained
      );
      assert.deepEqual(await f.receive(), retained);
      assert.equal(f.calls, 1);
      assert.deepEqual(readFileSync(f.receiptPath), bytes);
    })
);

test('validly resealed orders outside the original bounded child policy still hold before decision', async () =>
  using(async f => {
    for (const mutate of [
      body => {
        body.riskTier = 'high';
      },
      body => {
        body.requiredCapabilities = ['research'];
      },
      body => {
        body.permittedActions = [action];
      },
      body => {
        body.forbiddenActions = ['bind-projected-child'];
      },
    ]) {
      const b = binding();
      const { digest: _digest, ...body } = b.order;
      mutate(body);
      b.order = sealWorkOrder(body);
      f.setCurrent(b);
      await assert.rejects(f.receive(), /order-invalid/);
      assert.equal(f.calls, 0);
      assert.equal(existsSync(f.intentPath), false);
    }
  }));

test('cryptographically verified but contradictory owner adapter snapshots cannot rebind an operation', async () => {
  for (const movementAt of [2, 3])
    await using(async f => {
      const original = f.deps.verifyAuthority;
      let verifications = 0;
      f.deps.verifyAuthority = async (...args) => {
        const verified = await original(...args);
        if (++verifications === movementAt)
          verified.lineage.sourceVersion = 'e'.repeat(40);
        return verified;
      };
      await assert.rejects(f.receive(), /authority-changed/);
      assert.equal(existsSync(f.receiptPath), false);
      assert.equal(f.calls, movementAt === 3 ? 1 : 0);
      assert.equal(existsSync(f.intentPath), movementAt === 3);
    });
});

test('changed intent and post-write receipt readback stay unknown', {
  concurrent: false,
}, async () => {
  for (const changedAt of [1, 2])
    await using(async f => {
      const original = fs.fsyncSync;
      let directorySyncs = 0;
      fs.fsyncSync = fd => {
        original(fd);
        if (fs.fstatSync(fd).isDirectory() && ++directorySyncs === changedAt)
          writeFileSync(changedAt === 1 ? f.intentPath : f.receiptPath, '{}');
      };
      syncBuiltinESMExports();
      try {
        await assert.rejects(
          f.receive(),
          changedAt === 1 ? /intent-unproved/ : /write-unproved/
        );
        assert.equal(f.calls, changedAt === 1 ? 0 : 1);
      } finally {
        fs.fsyncSync = original;
        syncBuiltinESMExports();
      }
    });
});

test(
  'receipt movement during replay durability proof cannot return a mixed snapshot',
  { concurrent: false },
  async () =>
    using(async f => {
      const evidence = await f.receive();
      const original = fs.fsyncSync;
      fs.fsyncSync = fd => {
        original(fd);
        if (fs.fstatSync(fd).isDirectory()) writeFileSync(f.receiptPath, '{}');
      };
      syncBuiltinESMExports();
      try {
        await assert.rejects(
          f.read(evidence.acknowledgment.receiptRef),
          /read-unproved/
        );
        assert.equal(f.calls, 1);
      } finally {
        fs.fsyncSync = original;
        syncBuiltinESMExports();
      }
    })
);

test(
  'temporary cleanup failure cannot report success or repeat a retained recipient decision',
  { concurrent: false },
  async () =>
    using(async f => {
      const original = fs.unlinkSync;
      fs.unlinkSync = path => {
        if (
          String(path).startsWith(f.receiptPath + '.') &&
          String(path).endsWith('.tmp')
        )
          throw Error('test-cleanup-uncertain');
        return original(path);
      };
      syncBuiltinESMExports();
      try {
        await assert.rejects(f.receive(), /cleanup-uncertain/);
        assert.equal(f.calls, 1);
      } finally {
        fs.unlinkSync = original;
        syncBuiltinESMExports();
      }
      const bytes = readFileSync(f.receiptPath);
      const retained = JSON.parse(bytes.toString('utf8')).evidence;
      assert.deepEqual(
        await f.read(retained.acknowledgment.receiptRef),
        retained
      );
      assert.deepEqual(await f.receive(), retained);
      assert.equal(f.calls, 1);
      assert.deepEqual(readFileSync(f.receiptPath), bytes);
    })
);

test('early authenticated projection may precede later dispatch observation without repeating recipient decision', async () =>
  using(async f => {
    const b = binding();
    b.lineage.projectionCompletedAt = '2026-10-09T01:01:05.000Z';
    // This is the persisted caller dispatch observation, not an attestation
    // of the exact outbox publication time.
    b.lineage.dispatchObservedAt = '2026-10-09T01:01:10.000Z';
    f.setCurrent(b);
    const evidence = await f.receive();
    const bytes = readFileSync(f.receiptPath);
    assert.equal(evidence.acknowledgment.disposition, 'accepted');
    assert.deepEqual(evidence.scope, b.order.scope);
    assert.deepEqual(evidence.dispatchAck, b.dispatchAck);
    assert.deepEqual(
      JSON.parse(bytes.toString('utf8')).binding.order.budget,
      b.order.budget
    );
    assert.deepEqual(
      await f.read(evidence.acknowledgment.receiptRef),
      evidence
    );
    assert.deepEqual(await f.receive(), evidence);
    assert.equal(f.calls, 1);
    assert.deepEqual(readFileSync(f.receiptPath), bytes);
  }));

test('independent causal prerequisites reject invalid orderings, missing intent and legacy publication claims', async () =>
  using(async f => {
    for (const mutate of [
      b => {
        b.lineage.callerIntentRecordedAt = '2026-10-09T00:59:59.000Z';
      },
      b => {
        b.lineage.dispatchObservedAt = '2026-10-09T00:59:59.000Z';
      },
      b => {
        b.lineage.callerIntentRecordedAt = '2026-10-09T01:01:01.000Z';
        b.lineage.dispatchObservedAt = '2026-10-09T01:01:02.000Z';
      },
      b => {
        b.lineage.projectionCompletedAt = '2026-10-09T01:02:01.000Z';
      },
      b => {
        b.lineage.dispatchObservedAt = '2026-10-09T01:02:01.000Z';
      },
      b => {
        b.dispatchAck.dispatchedAt = '2026-10-09T01:01:59.000Z';
      },
      b => {
        b.dispatchAck.dispatchedAt = '2026-10-09T01:04:01.000Z';
      },
      b => {
        delete b.lineage.callerIntentRecordedAt;
      },
      b => {
        delete b.lineage.dispatchObservedAt;
        b.lineage.outboxPublishedAt = first;
      },
    ]) {
      const b = binding();
      mutate(b);
      f.setCurrent(b);
      await assert.rejects(f.receive(), /lineage-invalid|time-invalid/);
      assert.equal(f.calls, 0);
      assert.equal(existsSync(f.intentPath), false);
      assert.equal(existsSync(f.receiptPath), false);
    }
  }));
