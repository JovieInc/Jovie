import { describe, expect, it } from 'vitest';
import {
  featureKitStepIdsForDecision,
  STARTUP_FEATURE_KIT_PLAYBOOK,
} from './startup-feature-kit';

describe('startup feature kit', () => {
  it('takes a merged pull request as its intake', () => {
    expect(STARTUP_FEATURE_KIT_PLAYBOOK.intake.kind).toBe('merged_pr');
  });

  it('builds the full kit only for a coordinated launch', () => {
    const all = STARTUP_FEATURE_KIT_PLAYBOOK.steps.map(step => step.id);
    expect(featureKitStepIdsForDecision('coordinated_launch')).toEqual(all);
    for (const output of [
      'video',
      'thread',
      'linkedin',
      'email',
      'landing-section',
      'press-note',
    ]) {
      expect(all).toContain(output);
    }
  });

  it('keeps evidence and the results loop on smaller launches', () => {
    expect(featureKitStepIdsForDecision('changelog_notice')).toEqual([
      'decide-launch-size',
      'bind-claims',
      'changelog',
      'record-results',
    ]);
    expect(featureKitStepIdsForDecision('tutorial_demo')).toEqual([
      'decide-launch-size',
      'bind-claims',
      'video',
      'landing-section',
      'changelog',
      'record-results',
    ]);
  });

  it('creates no tasks when there is nothing to launch', () => {
    expect(featureKitStepIdsForDecision('no_action')).toEqual([]);
    expect(featureKitStepIdsForDecision('doc_update')).toEqual([]);
  });
});
