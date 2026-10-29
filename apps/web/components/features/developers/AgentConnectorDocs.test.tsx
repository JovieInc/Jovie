import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import snapshot from '@/lib/agent-distribution/generated/tools-list.snapshot.json';
import { LISTING } from '@/lib/agent-distribution/listing';
import { AgentConnectorDocs } from './AgentConnectorDocs';

describe('AgentConnectorDocs', () => {
  it('renders the MCP URL and one heading per tool', () => {
    render(
      <AgentConnectorDocs
        listing={LISTING}
        toolsListHash={snapshot.toolsListHash}
        tools={snapshot.tools}
      />
    );
    expect(screen.getByText(LISTING.mcpUrl)).toBeInTheDocument();
    for (const tool of snapshot.tools) {
      expect(
        screen.getByRole('heading', { name: tool.title })
      ).toBeInTheDocument();
    }
  });

  it('links three sibling developer pages from the page body', () => {
    render(
      <AgentConnectorDocs
        listing={LISTING}
        toolsListHash={snapshot.toolsListHash}
        tools={snapshot.tools}
      />
    );
    for (const href of ['/developers', '/cli', '/api-versioning']) {
      expect(
        document.querySelector(
          `[data-testid="agent-connector-docs"] a[href="${href}"]`
        )
      ).not.toBeNull();
    }
  });
});
