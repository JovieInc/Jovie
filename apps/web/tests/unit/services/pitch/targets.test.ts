import { describe, expect, it } from 'vitest';
import {
  buildReleasePitchChatPrompt,
  buildTaskPitchChatPrompt,
  inferPitchDestinationFromText,
  resolvePitchDestination,
} from '@/lib/services/pitch/targets';

describe('pitch target helpers', () => {
  it('infers playlist platform targets from release tasks', () => {
    expect(
      inferPitchDestinationFromText('Submit Spotify editorial pitch')
    ).toMatchObject({
      target: 'playlist',
      platform: 'spotify',
    });
  });

  it('maps music supervisor tasks to playback pitches', () => {
    expect(
      resolvePitchDestination({
        taskTitle: 'Send to music supervisors for playback',
      })
    ).toMatchObject({
      target: 'playback',
      platform: 'music_supervisor',
      label: 'Music supervisor playback',
    });
  });

  it('returns null when no destination is clear', () => {
    expect(resolvePitchDestination({ taskTitle: 'Upload artwork' })).toBeNull();
  });

  it('builds a skill prompt with release and task context', () => {
    const prompt = buildTaskPitchChatPrompt({
      releaseId: 'release-1',
      releaseTitle: 'Tidal Drift',
      taskTitle: 'Pitch to Sirius XM',
      taskCategory: 'radio',
    });

    expect(prompt).toContain('/skill:generateReleasePitch');
    expect(prompt).toContain('@release:release-1[Tidal Drift]');
    expect(prompt).toContain('"taskTitle":"Pitch to Sirius XM"');
  });

  it('builds a release action prompt that asks for destination first', () => {
    const prompt = buildReleasePitchChatPrompt({
      releaseId: 'release-1',
      releaseTitle: 'Tidal Drift',
    });

    expect(prompt).not.toContain('/skill:generateReleasePitch');
    expect(prompt).toContain('@release:release-1[Tidal Drift]');
    expect(prompt).toContain('Ask me where I want to pitch it');
  });
});
