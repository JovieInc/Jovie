import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = 'app/(marketing)/changelog/page.tsx';
const SIGNUP = 'app/(marketing)/changelog/ChangelogEmailSignup.tsx';
const ARCHIVE = 'components/marketing/changelog/CustomerChangelogArchive.tsx';

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('customer changelog IA contract', () => {
  it('keeps /changelog on customer outcomes instead of the release log', () => {
    const page = readWebSource(PAGE);
    const signup = readWebSource(SIGNUP);
    const archive = readWebSource(ARCHIVE);

    expect(page).toContain("What's new in Jovie");
    expect(page).toContain('Audience and control updates');
    expect(page).toContain('Not a log');
    expect(page).not.toContain(
      'Follow our journey building the future of music'
    );
    expect(page).toContain('CustomerChangelogArchive');
    expect(page).not.toContain('ChangelogTimeline');

    expect(signup).toContain('Get the good stuff');
    expect(signup).toContain('Occasional meaningful updates');
    expect(signup).not.toContain('Stay in the loop');
    expect(signup).not.toContain('changelog-reveal-button');
    expect(signup.match(/Subscribe/g)?.length).toBe(1);

    expect(archive).toContain('Load Earlier Updates');
    expect(archive).not.toContain('Show 5');
    expect(archive).not.toContain('Showing');
    expect(archive).toContain('Technical details');
    expect(archive).not.toContain('<img');
  });

  it('does not wire deploy-time customer email from the public page', () => {
    const page = readWebSource(PAGE);
    const signup = readWebSource(SIGNUP);

    expect(page).not.toContain('changelog:send');
    expect(page).not.toContain('send-changelog-email');
    expect(signup).toContain('/api/changelog/subscribe');
    expect(signup).not.toContain('changelog:send');
  });
});
