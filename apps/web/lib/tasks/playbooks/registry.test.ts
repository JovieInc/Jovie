import { lintCopy } from '@jovie/copy';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RELEASE_TASK_TEMPLATE } from '@/lib/release-tasks/default-template';
import { SHIPPED_AGENT_WORKFLOWS } from './autonomy';
import {
  getDefaultPlaybookId,
  isPlaybookId,
  listPlaybookTemplates,
  PLAYBOOK_TEMPLATES,
} from './registry';
import { PLAYBOOK_IDS } from './types';

const SHIPPED_AGENT_TYPES = SHIPPED_AGENT_WORKFLOWS;

const templates = Object.values(PLAYBOOK_TEMPLATES);

describe('playbook registry', () => {
  it('registers every playbook id exactly once', () => {
    expect(Object.keys(PLAYBOOK_TEMPLATES).sort()).toEqual(
      [...PLAYBOOK_IDS].sort()
    );
    for (const [id, template] of Object.entries(PLAYBOOK_TEMPLATES)) {
      expect(template.id).toBe(id);
    }
  });

  it.each(templates)('$id has unique step ids and finite offsets', template => {
    const ids = template.steps.map(step => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of template.steps) {
      expect(step.id).toMatch(/^[a-z0-9-]+$/);
      expect(Number.isInteger(step.offsetDays)).toBe(true);
      expect(step.phase.trim()).not.toBe('');
      expect(step.title.trim()).not.toBe('');
    }
  });

  it.each(templates)(
    '$id labels assistance honestly against shipped workflows',
    template => {
      const assisted = template.steps.filter(step => step.agentAssist);
      for (const step of assisted) {
        expect(SHIPPED_AGENT_TYPES.has(step.agentAssist?.agentType ?? '')).toBe(
          true
        );
        expect(step.owner).toBe('jovie');
      }
      if (template.assistMode === 'checklist_only') {
        expect(assisted).toHaveLength(0);
      } else {
        expect(assisted.length).toBeGreaterThan(0);
      }
    }
  );

  it('generalizes the release plan instead of forking it', () => {
    const music = PLAYBOOK_TEMPLATES['music-release'];
    expect(music.anchor).toBe('release');
    expect(music.steps.map(step => step.title)).toEqual(
      DEFAULT_RELEASE_TASK_TEMPLATE.map(item => item.title)
    );
    expect(music.steps.map(step => step.offsetDays)).toEqual(
      DEFAULT_RELEASE_TASK_TEMPLATE.map(item => item.dueDaysOffset)
    );
  });

  it('tracks every release-plan workflow as shipped', () => {
    for (const item of DEFAULT_RELEASE_TASK_TEMPLATE) {
      if (item.aiWorkflowId) {
        expect(SHIPPED_AGENT_WORKFLOWS.has(item.aiWorkflowId)).toBe(true);
      }
    }
  });

  it.each(templates)('$id defaults to review and closes the loop', template => {
    expect(template.defaultAutonomy).toBe('review');
    expect(template.iterative).toBe(true);
    if (template.anchor === 'date') {
      expect(template.steps.some(step => step.id === 'record-results')).toBe(
        true
      );
    }
  });

  it('cites https sources on every researched template', () => {
    for (const template of templates) {
      if (template.origin !== 'researched') continue;
      expect(template.anchor).toBe('date');
      expect(template.sources.length).toBeGreaterThan(0);
      for (const source of template.sources) {
        expect(source.url).toMatch(/^https:\/\//);
      }
    }
  });

  it('distills the book launch from Ferriss and Holiday', () => {
    const authors = new Set(
      PLAYBOOK_TEMPLATES['book-launch'].sources.map(source => source.author)
    );
    expect(authors).toEqual(new Set(['Tim Ferriss', 'Ryan Holiday']));
  });

  it('defaults music users to the music release and lists it first', () => {
    expect(getDefaultPlaybookId('artist')).toBe('music-release');
    expect(getDefaultPlaybookId(null)).toBe('music-release');
    expect(getDefaultPlaybookId('podcaster')).toBe('podcast-episode');
    expect(getDefaultPlaybookId('creator')).toBe('youtube-video');
    expect(listPlaybookTemplates('artist')[0]?.id).toBe('music-release');
    expect(listPlaybookTemplates('podcaster').map(t => t.id)).toEqual([
      'podcast-episode',
      'music-release',
      'youtube-video',
      'book-launch',
      'song-weekly-drops',
      'startup-feature-kit',
    ]);
  });

  it('guards untrusted playbook ids', () => {
    expect(isPlaybookId('book-launch')).toBe(true);
    expect(isPlaybookId('toString')).toBe(false);
    expect(isPlaybookId(42)).toBe(false);
  });

  it('writes researched template copy that passes the product UI gate', () => {
    // Music release reuses DEFAULT_RELEASE_TASK_TEMPLATE text, which predates
    // the copy system; only its playbook-level strings are new.
    const music = PLAYBOOK_TEMPLATES['music-release'];
    const strings = [
      music.name,
      music.summary,
      ...templates
        .filter(template => template.id !== 'music-release')
        .flatMap(template => [
          template.name,
          template.summary,
          template.targetDateLabel,
          template.projectNamePlaceholder,
          ...(template.intake.kind === 'none' ? [] : template.intake.prompts),
          ...template.steps.flatMap(step => [
            step.title,
            step.phase,
            step.explainerText ?? '',
          ]),
        ]),
    ].filter(Boolean);

    const blocking = strings.flatMap(text =>
      lintCopy(text, { register: 'jovie-product-ui' }).blocking.map(
        finding => `${finding.rule}: "${finding.match}" in "${text}"`
      )
    );
    expect(blocking).toEqual([]);
  });

  it('turns one song into 17 weekly Friday drops after a story intake', () => {
    const song = PLAYBOOK_TEMPLATES['song-weekly-drops'];
    const weekly = song.steps.filter(
      step => step.offsetDays >= 0 && step.id !== 'record-results'
    );
    expect(weekly).toHaveLength(17);
    expect(weekly.map(step => step.offsetDays)).toEqual(
      weekly.map((_, week) => week * 7)
    );
    expect(song.intake.kind).toBe('story_interview');
    expect(song.steps[0]?.id).toBe('tell-the-story');
  });
});
