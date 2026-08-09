import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WrappedLinkMissingState } from './WrappedLinkMissingState';

describe('web-193 wrapped-link missing state', () => {
  it('renders the exact shipped recovery presentation', () => {
    render(<WrappedLinkMissingState />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Link Not Found' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'The link you followed may be broken, expired, or unavailable.'
      )
    ).toBeVisible();
    expect(
      screen.getByText('Check the URL or ask the sender for a fresh link.')
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return Home' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.getByTestId('not-found')).toBeVisible();
  });

  it('keeps sensitive-link and challenge behavior in the server route', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/out/[id]/page.tsx'),
      'utf8'
    );
    const story = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/WrappedLinkMissingState.stories.tsx'
      ),
      'utf8'
    );

    expect(route).toContain(
      "import { WrappedLinkMissingState } from '@/components/organisms/WrappedLinkMissingState'"
    );
    expect(route).toContain('getWrappedLink(shortId)');
    expect(route).toContain("wrappedLink.kind !== 'sensitive'");
    expect(route).toContain('createChallengeToken(shortId)');
    expect(route).toContain('<InterstitialClient');
    expect(route).toContain('redirect(`/go/${shortId}`)');
    expect(route).not.toContain('function MissingLinkState()');

    expect(story).toContain('component: WrappedLinkMissingState');
    expect(story).toContain("registryId: 'web-193-out--[id]'");
    expect(story).toContain("route: '/out/missing'");
    expect(story).toContain("proofTier: 'partial-source'");
    expect(story).not.toContain('challengeToken:');
    expect(story).not.toContain('shortId:');
  });
});
