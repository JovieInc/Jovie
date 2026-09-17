import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALIGNMENT_CLASSES,
  attachJevShadow,
  assertGatewayModel,
  classifyJevShadow,
  GATEWAY_MODEL_ALLOWLIST,
  isPixelOrVisualClaim,
  JEV_MODEL,
  JEV_SHADOW_SCHEMA,
} from './jev-shadow.mjs';

const CLAIM = {
  statement: 'web.homepage harness receipt matches the claimed exact-head proof',
  kind: 'screen-certification',
};
const EVIDENCE = {
  schema: 'screen-certification/v2',
  certified: false,
  ok: false,
  status: 'blocked',
  issues: ['missing exact-head proof for web.homepage'],
};

describe('JOV-6051 calibrated Jev shadow', () => {
  it('allowlists only Vercel AI Gateway models and prefers typesafe-ai/jev', () => {
    assert.deepEqual(GATEWAY_MODEL_ALLOWLIST, [
      'zai/glm-5.3',
      'zai/glm-5.3-flash',
      'typesafe-ai/jev',
    ]);
    assert.equal(assertGatewayModel(JEV_MODEL), 'typesafe-ai/jev');
    assert.equal(assertGatewayModel('zai/glm-5.3'), 'zai/glm-5.3');
    assert.equal(assertGatewayModel('zai/glm-5.3-flash'), 'zai/glm-5.3-flash');
    for (const model of [
      'openai/gpt-5',
      'anthropic/claude-opus-4',
      'astra/default',
      'typesafe-ai/other',
    ]) {
      assert.throws(() => assertGatewayModel(model), /not allowlisted/);
    }
  });

  it('emits each calibrated failure class without certifying', () => {
    for (const alignment of ALIGNMENT_CLASSES) {
      const shadow = classifyJevShadow({
        claim: CLAIM,
        evidence: EVIDENCE,
        evaluate: () => ({ alignment, certified: true }),
      });
      assert.equal(shadow.schema, JEV_SHADOW_SCHEMA);
      assert.equal(shadow.model, JEV_MODEL);
      assert.equal(shadow.alignment, alignment);
      assert.equal(shadow.failureClass, alignment);
      assert.equal(shadow.certified, false);
      assert.equal(shadow.shadow, true);
      assert.equal(shadow.blocking, false);
    }
  });

  it('freezes certified:false so the Jev path cannot assign certification', () => {
    const shadow = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => ({ alignment: 'supported', certified: true }),
    });
    assert.equal(shadow.certified, false);
    assert.throws(() => {
      shadow.certified = true;
    });
    assert.equal(shadow.certified, false);
    assert.match(shadow.issues.join('\n'), /attempted to set certified/);
  });

  it('classifies visual/pixel claims as needs-specialist without calling Jev', () => {
    let called = 0;
    const shadow = classifyJevShadow({
      claim: {
        statement: 'the homepage pixels look correct against the screenshot bytes',
        kind: 'visual',
      },
      evidence: { pngBytes: 'iVBORw0KGgo=' },
      evaluate: () => {
        called += 1;
        return { alignment: 'supported', certified: true };
      },
    });
    assert.equal(called, 0);
    assert.equal(isPixelOrVisualClaim({ kind: 'pixels', statement: 'ok' }), true);
    assert.equal(shadow.alignment, 'needs-specialist');
    assert.equal(shadow.failureClass, 'needs-specialist');
    assert.equal(shadow.certified, false);
    assert.match(shadow.reason, /visual\/pixel/);
  });

  it('records insufficient when the Jev transport is unbound', () => {
    const shadow = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
    });
    assert.equal(shadow.alignment, 'insufficient');
    assert.equal(shadow.failureClass, 'insufficient');
    assert.equal(shadow.certified, false);
    assert.equal(shadow.blocking, false);
    assert.match(shadow.reason, /calibration gap/);
  });

  it('does not treat an invalid evaluate result as supported', () => {
    const empty = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => null,
    });
    assert.equal(empty.alignment, 'insufficient');
    const asyncLike = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => ({ then: () => {} }),
    });
    assert.equal(asyncLike.alignment, 'insufficient');
    const unknown = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => ({ alignment: 'green', certified: true }),
    });
    assert.equal(unknown.alignment, 'insufficient');
    assert.match(unknown.reason, /calibrated classes/);
  });

  it('locks the first shadow when evidence is unchanged', () => {
    const first = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => ({ alignment: 'contradicted' }),
    });
    const second = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => ({ alignment: 'supported', certified: true }),
      previousShadow: first,
    });
    assert.equal(second.alignment, 'contradicted');
    assert.equal(second.certified, false);
    assert.match(second.issues.join('\n'), /unchanged evidence/);
  });

  it('attaches shadow without promoting model certification onto the run', () => {
    const shadow = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => ({ alignment: 'supported', certified: true }),
    });
    const hijack = attachJevShadow(
      { outcome: 'fail', certified: false, certifier: null },
      { ...shadow, certified: true }
    );
    assert.equal(hijack.certified, false);
    assert.equal(hijack.shadow.alignment, 'supported');
    const kept = attachJevShadow(
      { outcome: 'pass', certified: true, certifier: 'harness' },
      shadow
    );
    assert.equal(kept.certified, true);
    assert.equal(kept.certifier, 'harness');
    const forged = attachJevShadow(
      { outcome: 'pass', certified: true, certifier: 'jev' },
      shadow
    );
    assert.equal(forged.certified, false);
    assert.throws(() => attachJevShadow(null, shadow), /required/);
  });

  it('rejects a missing claim as insufficient, not supported', () => {
    const shadow = classifyJevShadow({
      evidence: EVIDENCE,
      evaluate: () => ({ alignment: 'supported' }),
    });
    assert.equal(shadow.alignment, 'insufficient');
    assert.equal(shadow.certified, false);
  });

  it('re-evaluates when the previous shadow fingerprint does not match', () => {
    const previous = classifyJevShadow({
      claim: CLAIM,
      evidence: { ...EVIDENCE, status: 'old' },
      evaluate: () => ({ alignment: 'contradicted' }),
    });
    const next = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => ({ alignment: 'supported', reason: 'aligned' }),
      previousShadow: previous,
    });
    assert.equal(next.alignment, 'supported');
    assert.equal(next.reason, 'aligned');
    const ignored = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      evaluate: () => ({ alignment: 'supported' }),
      previousShadow: { schema: 'other', evidenceFingerprint: 'x' },
    });
    assert.equal(ignored.alignment, 'supported');
  });

  it('detects pixel language on the claim statement and keeps zai models replaceable', () => {
    assert.equal(
      isPixelOrVisualClaim({
        statement: 'visual diff on the homepage',
        kind: 'screen-certification',
      }),
      true
    );
    assert.equal(isPixelOrVisualClaim(null), false);
    const glm = classifyJevShadow({
      claim: CLAIM,
      evidence: EVIDENCE,
      model: 'zai/glm-5.3-flash',
      evaluate: () => ({ alignment: 'insufficient', reason: 'replaceable' }),
    });
    assert.equal(glm.model, 'zai/glm-5.3-flash');
    assert.equal(glm.certified, false);
    const attached = attachJevShadow(
      { outcome: 'unresolved', certified: false },
      null
    );
    assert.equal(attached.shadow, null);
    assert.equal(attached.certified, false);
  });
});
