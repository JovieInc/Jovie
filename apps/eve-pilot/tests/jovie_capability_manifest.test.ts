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

describe('native conversation tool availability', () => {
  it.each([
    'session.started',
    'turn.started',
  ] as const)('omits every remaining tool at %s for conversation auth, preserving commercial capability', async lifecycle => {
    const { default: definition, manifestTool } = await import(
      '../agent/tools/jovie_capability_manifest'
    );
    const resolver = definition.events[lifecycle]!;
    const context = (attributes: Record<string, string>) =>
      ({
        session: { id: 'ses_test', auth: { current: { attributes } } },
        channel: {},
        messages: [],
      }) as Parameters<typeof resolver>[1];
    expect(
      await resolver({}, context({ summerConversation: 'true' }))
    ).toBeNull();
    expect(await resolver({}, context({ source: 'ovie-summer-shadow' }))).toBe(
      manifestTool
    );
  });
});
