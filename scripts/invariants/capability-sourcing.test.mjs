import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANON_ENGINEERING_PATH,
  CAPABILITY_SOURCING_INVARIANT_ID,
  CAPABILITY_SOURCING_SCHEMA,
  CODE_STYLE_MARKER,
  CODE_STYLE_RULE_PATH,
  ROUTER_PATH,
  ROUTER_POLICY_MARKER,
  TOOL_DISCOVERY_CAPABILITY_MARKER,
  TOOL_DISCOVERY_SKILL_PATH,
  validateCapabilitySourcing,
} from './capability-sourcing.mjs';
import { readInvariantRegistry } from './registry.mjs';

const REGISTRY = readInvariantRegistry();

function surfaces() {
  return {
    [CANON_ENGINEERING_PATH]: `# Jovie Engineering Canon\n\n## Capability Sourcing (JOV-6212)\n\nMinimize lifetime ownership of undifferentiated mechanisms, subject to required correctness, security, reliability, privacy, performance and user experience. Before new or materially expanded commodity work, classify each consequential capability and name its canonical implementation/owner; custom or fork decisions must weigh lifetime integration, maintenance, security updates and the rest of lifetime cost. One authoritative implementation per capability and scope. The implementation author cannot approve their own exception; exceptions get independent review.\n`,
    [ROUTER_PATH]: `| Task | Read |\n|---|---|\n${ROUTER_POLICY_MARKER}\n`,
    [CODE_STYLE_RULE_PATH]: `# Code Style\n\n${CODE_STYLE_MARKER}\n\nSee [canon/ENGINEERING.md](../../canon/ENGINEERING.md) "Capability Sourcing (JOV-6212)" — classification, canonical implementation/owner, alternatives, disposition, lifetime cost, and independent review for exceptions live there. Runs before the Prior-Art Gate at capability level.\n`,
    [TOOL_DISCOVERY_SKILL_PATH]: `# Tool Discovery\n\n${TOOL_DISCOVERY_CAPABILITY_MARKER}\n\nBefore new or materially expanded commodity capability work, classify the capability and record the sourcing decision per [canon/ENGINEERING.md](../../../canon/ENGINEERING.md).\n`,
  };
}

describe('JOV-INV-041 capability sourcing', () => {
  it('binds JOV-INV-041 in the adopted registry', () => {
    const invariant = REGISTRY.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    );
    assert.ok(invariant);
    assert.equal(invariant.lifecycle.state, 'adopted');
    assert.equal(invariant.policy.value.schema, CAPABILITY_SOURCING_SCHEMA);
    assert.equal(
      invariant.policy.value.canonicalPolicy,
      CANON_ENGINEERING_PATH
    );
  });

  it('accepts the checked-in policy surfaces', () => {
    assert.deepEqual(validateCapabilitySourcing({ registry: REGISTRY }), []);
  });

  it('fails closed when the invariant is missing from the registry', () => {
    const errors = validateCapabilitySourcing({
      registry: {
        invariants: REGISTRY.invariants.filter(
          item => item.id !== CAPABILITY_SOURCING_INVARIANT_ID
        ),
      },
      files: surfaces(),
    });
    assert.ok(
      errors.some(
        error => error.includes('JOV-INV-041') && error.includes('absent')
      )
    );
  });

  it('deliberate red: a dropped router row fails closed', () => {
    const files = surfaces();
    delete files[ROUTER_PATH];
    files[ROUTER_PATH] = '| Task | Read |\n|---|---|\n';
    const errors = validateCapabilitySourcing({
      registry: REGISTRY,
      files,
    });
    assert.ok(errors.some(error => error.includes(ROUTER_PATH)));
  });

  it('deliberate red: a duplicated router row fails closed', () => {
    const files = surfaces();
    files[ROUTER_PATH] =
      `| Task | Read |\n|---|---|\n${ROUTER_POLICY_MARKER}\n${ROUTER_POLICY_MARKER}\n`;
    const errors = validateCapabilitySourcing({
      registry: REGISTRY,
      files,
    });
    assert.ok(errors.some(error => error.includes('exactly once')));
  });

  it('deliberate red: a dropped canonical policy section fails closed', () => {
    const files = surfaces();
    files[CANON_ENGINEERING_PATH] = '# Jovie Engineering Canon\n';
    const errors = validateCapabilitySourcing({
      registry: REGISTRY,
      files,
    });
    assert.ok(
      errors.some(
        error =>
          error.includes(CANON_ENGINEERING_PATH) &&
          error.includes('canonical policy marker')
      )
    );
  });

  it('deliberate red: a duplicated canonical policy in the scoped rule fails closed', () => {
    const files = surfaces();
    files[CODE_STYLE_RULE_PATH] =
      `# Code Style\n\n${CODE_STYLE_MARKER}\n\nMinimize lifetime ownership of undifferentiated mechanisms — duplicated copy instead of routing.\n`;
    const errors = validateCapabilitySourcing({
      registry: REGISTRY,
      files,
    });
    assert.ok(
      errors.some(
        error =>
          error.includes(CODE_STYLE_RULE_PATH) && error.includes('duplicated')
      )
    );
  });

  it('deliberate red: a tool-discovery skill without the capability-first mode fails closed', () => {
    const files = surfaces();
    files[TOOL_DISCOVERY_SKILL_PATH] =
      `# Tool Discovery\n\nNo capability mode.\n`;
    const errors = validateCapabilitySourcing({
      registry: REGISTRY,
      files,
    });
    assert.ok(
      errors.some(
        error =>
          error.includes(TOOL_DISCOVERY_SKILL_PATH) &&
          error.includes('capability-first mode')
      )
    );
  });

  it('deliberate red: a second policy authority fails closed', () => {
    const registry = JSON.parse(JSON.stringify(REGISTRY));
    const invariant = registry.invariants.find(
      item => item.id === CAPABILITY_SOURCING_INVARIANT_ID
    );
    invariant.policy.value.canonicalPolicy = 'docs/SOURCING.md';
    const errors = validateCapabilitySourcing({
      registry,
      files: surfaces(),
    });
    assert.ok(
      errors.some(error => error.includes('canonical policy must stay'))
    );
  });
});
