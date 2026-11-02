import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import snapshot from '@/lib/agent-distribution/generated/tools-list.snapshot.json';
import { hashTools } from '@/lib/agent-distribution/hash';
import { LISTING } from '@/lib/agent-distribution/listing';
import AgentConnectorDocsPage, { metadata } from './page';

describe('agent connector docs page', () => {
  it('lists every registry tool with its title and carries the tools/list hash', () => {
    const { container } = render(<AgentConnectorDocsPage />);
    const root = container.querySelector(
      '[data-testid="agent-connector-docs"]'
    );
    expect(root?.getAttribute('data-tools-list-hash')).toBe(
      hashTools(snapshot.tools)
    );
    for (const tool of snapshot.tools) {
      expect(screen.getByText(tool.name)).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: tool.title })
      ).toBeInTheDocument();
    }
  });

  it('states the URL, auth, limits, draft expiry and legal links', () => {
    render(<AgentConnectorDocsPage />);
    expect(screen.getByText(LISTING.mcpUrl)).toBeInTheDocument();
    expect(screen.getByText(LISTING.docsPage.authText)).toBeInTheDocument();
    expect(screen.getByText(LISTING.docsPage.limitsText)).toBeInTheDocument();
    expect(screen.getByText(LISTING.docsPage.expiryText)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: LISTING.docsPage.privacyLabel })
    ).toHaveAttribute('href', '/legal/privacy'.replace(/^/, 'https://jov.ie'));
    expect(
      screen.getByRole('link', { name: LISTING.docsPage.termsLabel })
    ).toHaveAttribute('href', 'https://jov.ie/legal/terms');
  });

  it('uses no banned language and the canonical URL', () => {
    const { container } = render(<AgentConnectorDocsPage />);
    expect(container.textContent).not.toMatch(/\bfans?\b/i);
    expect(metadata.alternates?.canonical).toBe(
      'https://jov.ie/developers/agents'
    );
    expect(LISTING.docsUrl).toBe('https://jov.ie/developers/agents');
  });
});
