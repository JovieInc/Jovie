import { describe, expect, it } from 'vitest';
import { lintVoice } from '@/lib/chat/voice-lint';
import {
  ONBOARDING_CALIBRATION_EXAMPLES,
  ONBOARDING_SYSTEM_PROMPT,
} from './onboarding';
import { resolveChatPromptRegistryEntry } from './registry';

/** Policy regression only: no inference execution or provider-backed proof. */
describe('onboarding compact response policy', () => {
  it('starts without assuming a musician, price, or account entitlement', () => {
    const opener = ONBOARDING_CALIBRATION_EXAMPLES.opener;
    expect(opener).not.toMatch(/artist|musician|Spotify|ISRC|\$|paid|claimed/i);
    expect(opener.length).toBeLessThan(120);
    expect(opener.match(/\?/g)).toHaveLength(1);
    expect(opener).toContain('if you sign up');
  });

  it('keeps calibration compact and removes raw enrichment source narration', () => {
    for (const line of Object.values(ONBOARDING_CALIBRATION_EXAMPLES)) {
      expect(lintVoice(line).ok).toBe(true);
      expect(line).not.toMatch(/\(source:\s*enrichment\)|^\d+\./i);
    }
    expect(
      ONBOARDING_CALIBRATION_EXAMPLES.afterSpotifyPick.length
    ).toBeLessThan(190);
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('No numbered plans');
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('Unknown stays unknown');
  });

  it('requires role choice and distinct evidence-grounded jobs without changing admission', () => {
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'which job they want to prioritize'
    );
    for (const role of [
      'Musician:',
      'Founder:',
      'Author:',
      'Creator:',
      'Expert:',
    ]) {
      expect(ONBOARDING_SYSTEM_PROMPT).toContain(role);
    }
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'do not mention Spotify, followers, releases, or ISRC unprompted'
    );
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'never promise instant access or extend access policy to a new role'
    );
  });

  it('makes server permission, conflict recovery, and persisted outcomes explicit', () => {
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'Never offer Claim, a new handle, or checkout after an ownership conflict'
    );
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'Publish without verified ownership and publish permission'
    );
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'Edit without verified ownership and edit permission'
    );
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'Upgrade when the server offer is unavailable or unknown'
    );
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'Wait for the completed server result'
    );
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(
      'without its persisted server receipt'
    );
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('without a CTA');
  });

  it('versions the changed onboarding prompt without changing its stable trace identity', () => {
    expect(resolveChatPromptRegistryEntry('onboarding')).toMatchObject({
      version: 2,
      versionId: 'jovie-chat-onboarding-system:v1',
    });
    expect(resolveChatPromptRegistryEntry('app').version).toBe(1);
  });
});
