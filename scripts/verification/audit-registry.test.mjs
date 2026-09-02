import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  auditDefinitionDigest,
  resolveOwedAudits,
  SYMPHONY_CHANGE_SAFETY_AUDIT,
  validateAuditDefinition,
  validateAuditEvidenceShape,
  validateProviderQualificationShape,
} from './audit-registry.mjs';
import {
  AUDIT_EVIDENCE_SCHEMA,
  digestObject,
  PROVIDER_QUALIFICATION_SCHEMA,
} from './contracts.mjs';

const DIGEST = 'd'.repeat(64);
const SHA = 'a'.repeat(40);

function evidence(overrides = {}) {
  return {
    schema: AUDIT_EVIDENCE_SCHEMA,
    evidenceId: 'evidence-1',
    eventId: 'event-1',
    auditId: 'symphony.change-safety',
    subject: {
      repository: 'JovieInc/Jovie',
      headSha: SHA,
      baseSha: SHA,
      mergeBaseSha: SHA,
      patchDigest: DIGEST,
      requiredContextDigest: DIGEST,
      artifactDigests: [],
    },
    auditDefinitionDigest: auditDefinitionDigest(SYMPHONY_CHANGE_SAFETY_AUDIT),
    toolDigest: DIGEST,
    modelDigest: null,
    configDigest: DIGEST,
    inputBundleDigest: DIGEST,
    redactionManifestDigest: DIGEST,
    outcome: 'unknown',
    producer: { kind: 'deterministic' },
    authority: { repositoryWrite: false },
    findings: [],
    supersedes: null,
    startedAt: '2026-09-02T00:00:00.000Z',
    completedAt: '2026-09-02T00:00:01.000Z',
    ...overrides,
  };
}

describe('shadow audit registry', () => {
  it('defines one valid non-projecting Symphony audit', () => {
    assert.deepEqual(validateAuditDefinition(SYMPHONY_CHANGE_SAFETY_AUDIT), []);
    assert.equal(SYMPHONY_CHANGE_SAFETY_AUDIT.writeAuthority, 'none');
    assert.deepEqual(SYMPHONY_CHANGE_SAFETY_AUDIT.projection, {
      mode: 'shadow',
      requiredCheck: false,
    });
    assert.match(
      auditDefinitionDigest(SYMPHONY_CHANGE_SAFETY_AUDIT),
      /^[a-f0-9]{64}$/
    );
  });

  it('resolves controller changes to the owned audit', () => {
    assert.deepEqual(
      resolveOwedAudits(['scripts/backlog-orchestrator/admitter.mjs']),
      {
        owedAuditIds: ['symphony.change-safety'],
        resolvedPaths: ['scripts/backlog-orchestrator/admitter.mjs'],
        unmappedPaths: [],
        maximalDebt: false,
        debtOutcome: null,
      }
    );
    assert.deepEqual(
      resolveOwedAudits(['scripts/backlog-orchestrator/example.generated.mjs'])
        .unmappedPaths,
      ['scripts/backlog-orchestrator/example.generated.mjs']
    );
  });

  it('deliberate red: unmapped paths owe maximal visible debt', () => {
    const result = resolveOwedAudits(['scripts/new-controller.mjs']);
    assert.deepEqual(result.owedAuditIds, ['symphony.change-safety']);
    assert.deepEqual(result.unmappedPaths, ['scripts/new-controller.mjs']);
    assert.equal(result.maximalDebt, true);
    assert.equal(result.debtOutcome, 'unknown');
  });

  it('rejects write authority or projection from the shadow definition', () => {
    const invalid = {
      ...structuredClone(SYMPHONY_CHANGE_SAFETY_AUDIT),
      writeAuthority: 'github',
      projection: { mode: 'shadow', requiredCheck: true },
    };
    assert.deepEqual(validateAuditDefinition(invalid), [
      'writeAuthority must be none in the shadow pilot',
      'projection must remain shadow-only and non-required',
    ]);
  });

  it('reports every malformed audit-definition field', () => {
    assert.deepEqual(validateAuditDefinition(null), [
      'audit definition schema must be jovie-audit-definition/v1',
    ]);
    const invalid = {
      ...structuredClone(SYMPHONY_CHANGE_SAFETY_AUDIT),
      auditId: '',
      scope: { include: [] },
      owner: '',
      riskClass: 'critical',
      deterministicTools: [],
      evidenceSchema: 'wrong',
      requiredContext: [],
    };
    assert.deepEqual(validateAuditDefinition(invalid), [
      'auditId is required',
      'scope.include must be a non-empty string list',
      'owner is required',
      'riskClass is invalid',
      'deterministicTools must be a non-empty string list',
      'evidenceSchema must be jovie-audit-evidence/v1',
      'requiredContext must be a non-empty string list',
    ]);
    assert.throws(() => auditDefinitionDigest(invalid), /auditId is required/);
    for (const exclude of ['generated', [false]]) {
      const badScope = {
        ...structuredClone(SYMPHONY_CHANGE_SAFETY_AUDIT),
        scope: { include: ['scripts/**'], exclude },
      };
      assert.deepEqual(validateAuditDefinition(badScope), [
        'scope.exclude must be a string list when present',
      ]);
      assert.throws(
        () => resolveOwedAudits(['scripts/example.mjs'], [badScope]),
        /scope\.exclude/
      );
    }
  });

  it('accepts explicit non-pass evidence and rejects missing binding', () => {
    assert.deepEqual(validateAuditEvidenceShape(evidence()), []);
    const invalid = evidence({
      subject: { ...evidence().subject, requiredContextDigest: '' },
    });
    assert.deepEqual(validateAuditEvidenceShape(invalid), [
      'subject.requiredContextDigest must be sha256',
    ]);
  });

  it('reports every malformed evidence field', () => {
    assert.deepEqual(validateAuditEvidenceShape(null), [
      'audit evidence schema must be jovie-audit-evidence/v1',
    ]);
    const invalid = evidence({
      evidenceId: '',
      eventId: '',
      auditId: '',
      subject: {
        repository: 'JovieInc/Jovie',
        headSha: '',
        baseSha: '',
        mergeBaseSha: '',
        patchDigest: '',
        requiredContextDigest: '',
        artifactDigests: ['wrong'],
      },
      auditDefinitionDigest: '',
      toolDigest: '',
      modelDigest: 'wrong',
      configDigest: '',
      inputBundleDigest: '',
      redactionManifestDigest: '',
      outcome: 'passed',
      producer: { kind: 'model' },
      authority: null,
      findings: null,
      supersedes: '',
      startedAt: '',
      completedAt: '',
    });
    assert.deepEqual(validateAuditEvidenceShape(invalid), [
      'evidenceId is required',
      'eventId is required',
      'auditId is required',
      'outcome is invalid',
      'subject.headSha must be exact',
      'subject.baseSha must be exact',
      'subject.mergeBaseSha must be exact',
      'subject.patchDigest must be sha256',
      'subject.requiredContextDigest must be sha256',
      'subject.artifactDigests must be a sha256 list',
      'auditDefinitionDigest must be sha256',
      'toolDigest must be sha256',
      'configDigest must be sha256',
      'inputBundleDigest must be sha256',
      'redactionManifestDigest must be sha256',
      'authority is required',
      'model producer qualification digest must be sha256',
      'modelDigest must be null or sha256',
      'findings must be a list',
      'supersedes must be null or an evidence id',
      'timestamps are required',
    ]);
    assert.deepEqual(
      validateAuditEvidenceShape(evidence({ subject: { repository: '' } })),
      ['subject.repository is required']
    );
    assert.deepEqual(
      validateAuditEvidenceShape(
        evidence({ producer: { kind: 'unqualified' } })
      ),
      ['producer kind must be deterministic or model']
    );
  });

  it('requires a versioned, content-addressed provider packet shape', () => {
    const packet = {
      schema: PROVIDER_QUALIFICATION_SCHEMA,
      provider: 'candidate-provider',
      model: 'model-1.2.3',
      owner: 'summer',
      expiresAt: '2026-09-03T00:00:00.000Z',
      modelSnapshotDigest: DIGEST,
      configDigest: DIGEST,
      promptDigest: DIGEST,
      bundleDigest: DIGEST,
      principal: { taskScoped: true },
      authority: {},
      dataTerms: {},
      goldenPacket: {},
    };
    assert.deepEqual(validateProviderQualificationShape(packet), []);
    assert.notEqual(digestObject(packet), DIGEST);
  });

  it('reports every malformed provider packet field', () => {
    assert.deepEqual(validateProviderQualificationShape(null), [
      'provider schema must be jovie-provider-qualification/v1',
    ]);
    const invalid = {
      schema: PROVIDER_QUALIFICATION_SCHEMA,
      provider: '',
      model: '',
      owner: '',
      expiresAt: '',
      modelSnapshotDigest: '',
      configDigest: '',
      promptDigest: '',
      bundleDigest: '',
      principal: {},
      authority: null,
      dataTerms: null,
      goldenPacket: null,
    };
    assert.deepEqual(validateProviderQualificationShape(invalid), [
      'provider is required',
      'model is required',
      'owner is required',
      'expiresAt is required',
      'modelSnapshotDigest must be sha256',
      'configDigest must be sha256',
      'promptDigest must be sha256',
      'bundleDigest must be sha256',
      'principal must be task scoped',
      'authority is required',
      'dataTerms are required',
      'goldenPacket is required',
    ]);
  });
});
