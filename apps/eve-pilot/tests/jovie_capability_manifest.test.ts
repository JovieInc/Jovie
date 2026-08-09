import { describe, expect, it } from 'vitest';
import { capabilityManifest } from '../agent/tools/jovie_capability_manifest';

describe('jovie capability manifest tool', () => {
  it('returns a read-only contract without external access or writes', () => {
    const result = capabilityManifest('connector');

    expect(result).toMatchObject({
      capability: 'connector',
      mode: 'read_only',
      externalAccess: false,
      writePerformed: false,
      pilot: true,
    });
    expect(result.approvalRequired).toContain('OAuth');
  });

  it('registers core chat as a read-only shadow capability', () => {
    expect(capabilityManifest('core_chat')).toMatchObject({
      capability: 'core_chat',
      mode: 'read_only',
      externalAccess: false,
      writePerformed: false,
      pilot: true,
    });
  });
});
