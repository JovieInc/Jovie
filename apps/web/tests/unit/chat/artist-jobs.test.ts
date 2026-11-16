import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARTIST_JOBS,
  type ArtistObject,
  jobsFor,
} from '@/lib/chat/artist-jobs';

const WEB_ROOT = path.resolve(__dirname, '../../..');
const OBJECTS: readonly ArtistObject[] = [
  'release',
  'channel',
  'profile',
  'fan',
];

describe('artist jobs', () => {
  it('keeps each object to a few jobs with unique ids', () => {
    const ids = ARTIST_JOBS.map(job => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const object of OBJECTS) {
      const jobs = jobsFor(object);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.length).toBeLessThanOrEqual(5);
      for (const job of jobs)
        expect(job.id.startsWith(`${object}.`)).toBe(true);
    }
  });

  it('names actions that still exist in their registry', () => {
    for (const job of ARTIST_JOBS) {
      if (!job.action) continue;
      const source = readFileSync(path.join(WEB_ROOT, job.action.file), 'utf8');
      expect(source, `${job.id} -> ${job.action.file}`).toContain(
        `id: '${job.action.id}'`
      );
    }
  });

  it('says what a chat-opening job carries and what chat must not ask for', () => {
    for (const job of ARTIST_JOBS.filter(j => j.opensChat)) {
      expect(job.carries, job.id).not.toBe('none');
      expect(job.screenAlreadyHad.length, job.id).toBeGreaterThan(0);
    }
  });

  it('tracks every job that does not work yet', () => {
    for (const job of ARTIST_JOBS.filter(j => j.status === 'drops-context')) {
      expect(job.issue, job.id).toMatch(/^JOV-\d+$/);
    }
  });
});
