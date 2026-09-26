import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GET as getLlmsTxt } from '@/app/llms.txt/route';
import DevelopersPage from './page';

const webRoot = process.cwd();

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('DevelopersPage', () => {
  it('renders the public artist API quickstart and machine-readable resources', () => {
    render(<DevelopersPage />);

    expect(
      screen.getByRole('heading', { name: 'Public artist data, in the open.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('curl https://jov.ie/api/v1/{username}')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Read the OpenAPI contract' })
    ).toHaveAttribute('href', '/openapi.json');
    expect(screen.getByRole('link', { name: 'llms.txt' })).toHaveAttribute(
      'href',
      '/llms.txt'
    );
    expect(screen.getByRole('link', { name: 'llms-full.txt' })).toHaveAttribute(
      'href',
      '/llms-full.txt'
    );
  });

  it('states the public API boundary without promising writes or credentials', () => {
    render(<DevelopersPage />);

    expect(
      screen.getByText(
        /anonymous GET access to data an artist has made public/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not add a write API, credentials/i)
    ).toBeInTheDocument();
  });

  it('links the read-only CLI and the API versioning policy alongside the contract', () => {
    render(<DevelopersPage />);

    expect(
      screen.getByRole('link', { name: /read-only jovie cli/i })
    ).toHaveAttribute('href', '/cli');
    expect(
      screen.getByRole('link', {
        name: /api versioning and deprecation policy/i,
      })
    ).toHaveAttribute('href', '/api-versioning');
  });

  it('renders an agent quickstart that only names verified public jobs', () => {
    render(<DevelopersPage />);

    expect(
      screen.getByRole('heading', { name: 'Agent quickstart' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Start from the same profile endpoint/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/anonymous and read-only; owner-only tools/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/cli' })).toHaveAttribute(
      'href',
      '/cli'
    );
    expect(screen.getByRole('link', { name: '/llms.txt' })).toHaveAttribute(
      'href',
      '/llms.txt'
    );
  });
});

describe('developer guide contract vs llms guidance (JOV-6265)', () => {
  it('keeps the developer page and llms.txt guidance on the same read-only boundary', async () => {
    const guidance = await getLlmsTxt().text();

    expect(guidance).toContain(
      'the public artist API and anonymous MCP tools are read-only'
    );
    // The HTML guide must agree with the machine guidance: neither surface
    // may claim a capability the other denies.
    const pageSource = readWebSource('app/(marketing)/developers/page.tsx');
    expect(pageSource).toContain('does not add a');
    expect(pageSource).toContain('write API');
    expect(pageSource).not.toMatch(/public write API|write endpoint/i);
  });

  it('rejects a false write-API claim leaking into agent-facing copy', () => {
    // Deliberate-red fixture: a hypothetical write capability advertised in
    // agent-facing copy must fail every honest-surface check.
    const falseWriteClaim =
      'Jovie offers a public write API: POST /api/v1/{username}/profile updates an artist profile anonymously.';
    const pageSource = readWebSource('app/(marketing)/developers/page.tsx');

    // The fixture itself is shaped like the claim we must never ship.
    expect(falseWriteClaim).toMatch(/public write API|POST \/api\/v1/i);
    expect(pageSource).not.toContain('public write API');
    expect(pageSource).not.toMatch(/POST \/api\/v1/i);
    expect(pageSource).not.toContain(falseWriteClaim);
  });

  it('keeps /cli command documentation aligned with the actual CLI surface', () => {
    const cliSource = readWebSource('../../packages/jovie-cli/src/cli.ts');
    const cliPageSource = readWebSource(
      'components/marketing/CliLandingPage.tsx'
    );

    // Every command the CLI landing page documents must exist in the CLI
    // implementation help text, and the CLI must stay read-only.
    for (const command of [
      'artist get <username>',
      'artist llms <username>',
      'api openapi',
      'docs llms',
    ]) {
      expect(
        cliPageSource,
        `CLI landing page must document ${command}`
      ).toContain(`jovie ${command}`);
      expect(
        cliSource,
        `CLI implementation must implement ${command}`
      ).toContain(command);
    }

    expect(cliSource).not.toMatch(
      /\bjovie (create|update|delete|patch|post|put|write)\b/i
    );
  });
});
