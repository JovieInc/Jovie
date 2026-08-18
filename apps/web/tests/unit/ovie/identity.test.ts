import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eveIdentityForChatMode, selectEveIdentity } from '@/lib/ovie/identity';

const JOVIE_INSTRUCTIONS = resolve(
  __dirname,
  '../../../../eve-pilot/identities/jovie/instructions.md'
);
const OVIE_INSTRUCTIONS = resolve(
  __dirname,
  '../../../../eve-pilot/identities/ovie/instructions.md'
);

describe('Eve identity packs (JOV-5216)', () => {
  it('keeps Jovie from privileged gbrain write and Symphony heal', () => {
    const pack = selectEveIdentity('jovie');
    expect(pack.role).toBe('artist');
    expect(pack.canPrivilegedWriteGbrain).toBe(false);
    expect(pack.canHealSymphony).toBe(false);
    expect(pack.canReadGbrain).toBe(false);
    expect(pack.allowsLybHealthMemory).toBe(false);
  });

  it('lets Ovie ingest/ack and read gbrain only', () => {
    const pack = selectEveIdentity('ovie');
    expect(pack.role).toBe('founder');
    expect(pack.canIngestAck).toBe(true);
    expect(pack.canReadGbrain).toBe(true);
    expect(pack.canPrivilegedWriteGbrain).toBe(false);
    expect(pack.canHealSymphony).toBe(false);
    expect(pack.allowsLybHealthMemory).toBe(false);
  });

  it('maps ov chat mode to the Ovie pack, not a prompt flag', () => {
    expect(eveIdentityForChatMode('ov').id).toBe('ovie');
    expect(eveIdentityForChatMode(null).id).toBe('jovie');
  });

  it('instruction files match the pack isolation rules', () => {
    const jovie = readFileSync(JOVIE_INSTRUCTIONS, 'utf8');
    const ovie = readFileSync(OVIE_INSTRUCTIONS, 'utf8');
    expect(jovie.includes('privileged gbrain write')).toBe(false);
    expect(jovie.includes('Symphony heal')).toBe(false);
    expect(ovie.includes('ingest and ack')).toBe(true);
    expect(ovie.includes('read')).toBe(true);
    expect(ovie.includes('gbrain')).toBe(true);
  });
});
