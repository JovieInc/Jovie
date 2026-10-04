import { describe, expect, it } from 'vitest';

import {
  blockedHostReason,
  checkCapturePermission,
  isPathAllowedByRobots,
} from '@/lib/agent-os/design-reference-corpus/capture-policy';

const ROBOTS = `
User-agent: *
Disallow: /private
Allow: /private/press
Disallow: /*.pdf$

User-agent: GPTBot
Disallow: /
`;

function fetcher(status: number, body = ''): typeof fetch {
  return (async () => new Response(body, { status })) as typeof fetch;
}

describe('isPathAllowedByRobots', () => {
  it('treats brackets as literal path characters, including an unmatched bracket', () => {
    const robots = 'User-agent: *\nDisallow: /path[abc]/';
    expect(isPathAllowedByRobots(robots, '/path[abc]/image')).toBe(false);
    expect(isPathAllowedByRobots(robots, '/patha/image')).toBe(true);
    expect(
      isPathAllowedByRobots(
        'User-agent: *\nDisallow: /unfinished[',
        '/unfinished[image'
      )
    ).toBe(false);
  });

  it('applies the wildcard group with longest-match precedence', () => {
    expect(isPathAllowedByRobots(ROBOTS, '/')).toBe(true);
    expect(isPathAllowedByRobots(ROBOTS, '/private/team')).toBe(false);
    expect(isPathAllowedByRobots(ROBOTS, '/private/press/kit')).toBe(true);
    expect(isPathAllowedByRobots(ROBOTS, '/deck.pdf')).toBe(false);
    expect(isPathAllowedByRobots(ROBOTS, '/deck.pdf?x=1')).toBe(true);
  });

  it('prefers a group naming our agent over the wildcard', () => {
    const robots =
      'User-agent: *\nDisallow: /\n\nUser-agent: JovieDesignRefs\nAllow: /';
    expect(isPathAllowedByRobots(robots, '/')).toBe(true);
    expect(isPathAllowedByRobots(ROBOTS, '/', 'GPTBot')).toBe(false);
  });

  it('allows everything for an empty file or an empty Disallow', () => {
    expect(isPathAllowedByRobots('', '/anything')).toBe(true);
    expect(isPathAllowedByRobots('User-agent: *\nDisallow:', '/x')).toBe(true);
  });
});

describe('blockedHostReason', () => {
  it('refuses hosts whose terms forbid scraping, subdomains included', () => {
    expect(blockedHostReason(new URL('https://dribbble.com/shots/1'))).toMatch(
      /terms/u
    );
    expect(
      blockedHostReason(new URL('https://www.behance.net/x'))
    ).not.toBeNull();
    expect(blockedHostReason(new URL('https://linear.app/'))).toBeNull();
  });
});

describe('checkCapturePermission', () => {
  it('allows a missing robots.txt and honours a disallow', async () => {
    const url = new URL('https://example.com/');
    expect(await checkCapturePermission(url, fetcher(404))).toEqual({
      allowed: true,
    });
    expect(
      await checkCapturePermission(
        url,
        fetcher(200, 'User-agent: *\nDisallow: /')
      )
    ).toMatchObject({ allowed: false });
  });

  it('fails closed when robots.txt errors or is unreachable', async () => {
    const url = new URL('https://example.com/');
    expect(await checkCapturePermission(url, fetcher(503))).toMatchObject({
      allowed: false,
    });
    const down = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    expect(await checkCapturePermission(url, down)).toMatchObject({
      allowed: false,
    });
  });

  it('refuses blocked hosts without fetching', async () => {
    const never = (async () => {
      throw new Error('should not fetch');
    }) as unknown as typeof fetch;
    expect(
      await checkCapturePermission(new URL('https://dribbble.com/'), never)
    ).toMatchObject({ allowed: false });
  });
});
