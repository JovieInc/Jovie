import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import snapshot from '@/lib/agent-distribution/generated/tools-list.snapshot.json';
import { LISTING } from '@/lib/agent-distribution/listing';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AgentConnectorDocs } from './AgentConnectorDocs';

const page = LISTING.docsPage;

function renderDocs(tools: Parameters<typeof AgentConnectorDocs>[0]['tools']) {
  return render(
    <AgentConnectorDocs
      listing={LISTING}
      toolsListHash={snapshot.toolsListHash}
      tools={tools}
    />
  );
}

describe('AgentConnectorDocs certificate', () => {
  it('renders the full page axe-clean with keyboard-reachable related links', async () => {
    const user = userEvent.setup();
    const { container } = renderDocs(snapshot.tools);

    expect(screen.getByTestId('agent-connector-docs')).toHaveAttribute(
      'data-tools-list-hash',
      snapshot.toolsListHash
    );
    expect(
      screen.getByRole('heading', { level: 1, name: page.title })
    ).toBeInTheDocument();
    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Developers Overview' })
    ).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps every section with an empty tools list', async () => {
    const { container } = renderDocs([]);

    const toolsSection = screen.getByRole('region', {
      name: page.toolsHeading,
    });
    expect(within(toolsSection).queryAllByRole('listitem')).toHaveLength(0);
    expect(
      screen.getByRole('heading', { name: page.authHeading })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the tool name and labels write and retry hints', async () => {
    const { container } = renderDocs([
      { name: 'list_releases', description: 'Lists your releases.' },
      {
        name: 'read_profile',
        title: 'Read profile',
        description: 'Reads your profile.',
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    ]);

    expect(
      screen.getByRole('heading', { level: 3, name: 'list_releases' })
    ).toBeInTheDocument();
    const toolsSection = screen.getByRole('region', {
      name: page.toolsHeading,
    });
    const [writeTool, readTool] = within(toolsSection).getAllByRole('listitem');
    expect(writeTool).toHaveTextContent(page.writeLabel);
    expect(readTool).toHaveTextContent(
      `read_profile · ${page.readOnlyLabel} · ${page.retryLabel}`
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long tool copy whole in a right-to-left document', async () => {
    const description =
      'Creates a pre-save campaign for an upcoming release and builds a tracked link for each store.';
    const { container } = render(
      <div dir='rtl'>
        <AgentConnectorDocs
          listing={LISTING}
          toolsListHash={snapshot.toolsListHash}
          tools={[
            {
              name: 'create_release_presave_campaign_with_tracked_links',
              description,
            },
          ]}
        />
      </div>
    );

    expect(screen.getByText(description)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
