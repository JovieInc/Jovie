import { describe, expect, it } from 'vitest';
import { bindEveIdentityForTurn } from '@/lib/ovie/identity';
import {
  assertModelMustNotSelfIdentifyAsOvie,
  assertOvieDoorDoesNotUseArtistJovieGeneration,
  CODING_PROVENANCE,
  GEM_OPENCLAW_AGENT_STATUS,
  HELD_OVIE_PERSONA_PRS,
  isM1Passed,
  M1_INSUFFICIENT_PROOF_TIERS,
  MERGE_AUTHORITY,
  OPERATIONAL_TRUTH_STATES,
  OVIE_CANONICAL_FLOW,
  OVIE_PROGRAM,
  OVIE_PROGRAM_CHILDREN,
  OVIE_PROGRAM_ROLES,
  OvieProgramError,
  PROOF_TIERS,
  reportM1Status,
  reviveGemOpenClawAgent,
  TELEMETRY_BRIDGE,
  telemetryBridgeAllowsActuation,
} from '@/lib/ovie/program';
import { resolveOvieDoorGeneration } from '@/lib/ovie/summer-transport';

describe('JOV-5214 Ovie program contract', () => {
  it('names the founder-corrected flow, roles, children, and provenance', () => {
    expect(OVIE_PROGRAM.id).toBe('JOV-5214');
    expect(OVIE_CANONICAL_FLOW).toContain('Ovie -> Eve intake/ack');
    expect(OVIE_CANONICAL_FLOW).toContain('Summer -> Symphony');
    expect(OVIE_CANONICAL_FLOW).toContain('Gem Ubuntu');
    expect(OVIE_PROGRAM_ROLES.ovie.isPersona).toBe(false);
    expect(OVIE_PROGRAM_ROLES.ovie.isModelIdentity).toBe(false);
    expect(OVIE_PROGRAM_ROLES.ovie.isSourceOfTruth).toBe(false);
    expect(OVIE_PROGRAM_ROLES.eve.discretionaryAuthority).toBe(false);
    expect(OVIE_PROGRAM_ROLES.summer.mayEditProductCode).toBe(false);
    expect(OVIE_PROGRAM_ROLES.summer.ownsCompanyKanban).toBe(true);
    expect(OVIE_PROGRAM_ROLES.symphony.soleOrchestrator).toBe(true);
    expect(OVIE_PROGRAM_ROLES.gem.isAgent).toBe(false);
    expect(CODING_PROVENANCE).toEqual({
      orchestrator: 'symphony',
      executionHost: 'gem',
    });
    expect(MERGE_AUTHORITY).toBe('github-native-merge-queue');
    expect(OVIE_PROGRAM.summerRuntimeThroughM1).toBe('mac');
    expect(OVIE_PROGRAM_CHILDREN).toEqual([
      'JOV-5215',
      'JOV-5212',
      'JOV-5226',
      'JOV-5248',
      'JOV-5249',
      'JOV-4320',
      'JOV-5253',
    ]);
    expect(HELD_OVIE_PERSONA_PRS).toEqual([16253, 16268]);
  });

  it('keeps M1 not-passed until dogfood and independent reproduction', () => {
    expect(OVIE_PROGRAM.m1Status).toBe('not-passed');
    expect(
      isM1Passed({
        dogfood: false,
        independentReproduction: false,
        presentTiers: M1_INSUFFICIENT_PROOF_TIERS,
      })
    ).toBe(false);
    expect(
      reportM1Status({
        dogfood: true,
        independentReproduction: false,
        presentTiers: [...M1_INSUFFICIENT_PROOF_TIERS, 'dogfood'],
      })
    ).toBe('not-passed');
    expect(
      isM1Passed({
        dogfood: true,
        independentReproduction: true,
        presentTiers: ['dogfood', 'recurrence'],
      })
    ).toBe(true);
    expect(PROOF_TIERS).toHaveLength(14);
    expect(new Set(PROOF_TIERS).size).toBe(PROOF_TIERS.length);
    expect(OPERATIONAL_TRUTH_STATES).toEqual([
      'fresh',
      'stale',
      'disconnected',
      'unavailable',
      'unauthorized',
      'degraded',
      'unknown',
      'failure',
      'recovery',
    ]);
  });

  it('keeps the Gem OpenClaw agent retired and telemetry read-only', () => {
    expect(GEM_OPENCLAW_AGENT_STATUS).toBe('retired');
    expect(() => reviveGemOpenClawAgent()).toThrow(OvieProgramError);
    expect(TELEMETRY_BRIDGE.mode).toBe('read-only');
    for (const surface of TELEMETRY_BRIDGE.forbiddenActuation) {
      expect(telemetryBridgeAllowsActuation(surface)).toBe(false);
    }
  });

  it('refuses artist Jovie fallthrough and Ovie self-id on the door', () => {
    expect(() =>
      assertOvieDoorDoesNotUseArtistJovieGeneration('ov', 'artist-jovie')
    ).toThrow(/fall through to ordinary artist Jovie chat/);
    expect(() =>
      assertOvieDoorDoesNotUseArtistJovieGeneration(null, 'artist-jovie')
    ).not.toThrow();
    expect(() =>
      assertModelMustNotSelfIdentifyAsOvie('I am Ovie, Tim’s talk door.')
    ).toThrow(OvieProgramError);
    expect(() =>
      assertModelMustNotSelfIdentifyAsOvie('Ask Ovie anything')
    ).toThrow(OvieProgramError);
    const transport = resolveOvieDoorGeneration('ov', [
      {
        text: 'research eval dogfood',
        lane: 'heavy',
        destination: 'kanban',
        ack: 'stored and queued for Summer lander',
        destinationHandle: null,
        workerSpawned: false,
      },
    ]);
    expect(transport.kind).toBe('summer-transport');
    if (transport.kind !== 'summer-transport') return;
    expect(transport.state).toBe('unavailable');
    expect(transport.speaker).toBe('summer');
    expect(transport.session).toBeNull();
    expect(transport.text).toContain('stored and queued for Summer lander');
    expect(transport.text).toContain('Ovie is the door, not the speaker');
    expect(transport.text.toLowerCase()).not.toMatch(/i am ovie/);
    expect(resolveOvieDoorGeneration(null).kind).toBe('artist-jovie');
  });

  it('loads Eve-on-door instructions that do not claim to be Ovie', () => {
    const turn = bindEveIdentityForTurn('ovie');
    expect(turn.pack.surface).toBe('door');
    expect(turn.pack.isPersona).toBe(false);
    expect(turn.pack.conversationalAuthority).toBe('summer');
    expect(turn.instructions.toLowerCase()).not.toMatch(/you are ovie/);
    expect(turn.instructions).toMatch(/ingest and ack/i);
    assertModelMustNotSelfIdentifyAsOvie(turn.instructions);
  });
});
