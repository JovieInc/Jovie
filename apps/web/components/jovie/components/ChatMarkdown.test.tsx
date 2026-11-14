import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatMarkdown } from './ChatMarkdown';

async function settled(container: HTMLElement) {
  await waitFor(() => {
    expect(
      container.querySelector('[data-source-markdown="ready"]')
    ).toBeTruthy();
  });
}

describe('ChatMarkdown', () => {
  it('renders a finished reply as markdown once source maps load', async () => {
    const { container } = render(
      <ChatMarkdown
        content={
          "Here's what I found for your release:\n\n- **Midnight Drive**: single, live now\n- 6 DSPs connected"
        }
      />
    );

    expect(
      container.querySelector('[data-source-markdown="pending"]')
    ).toBeTruthy();
    await settled(container);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Midnight Drive').tagName).toBe('STRONG');
    expect(container).not.toHaveTextContent('**');
    await expectNoA11yViolations(container);
  });

  it('renders a partial streamed chunk without raw markers', async () => {
    const { container } = render(
      <ChatMarkdown
        isStreaming
        content={"Here's what I found:\n\n- **Midnight Dri"}
      />
    );

    await settled(container);
    expect(container).toHaveTextContent('Midnight Dri');
    expect(container).not.toHaveTextContent('**');
    await expectNoA11yViolations(container);
  });

  it('renders inline prose without a paragraph wrapper', async () => {
    const { container } = render(
      <ChatMarkdown inline content='a **quick** inline note' />
    );

    await settled(container);
    expect(container.querySelector('p')).toBeNull();
    expect(screen.getByText('quick').tagName).toBe('STRONG');
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left replies whole', async () => {
    const long =
      'Your deluxe anniversary edition is picking up saves in every city you toured last spring. '.repeat(
        6
      );
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatMarkdown content={long} />
        <ChatMarkdown content='إصدارك **ليلة في القاهرة** متاح الآن' />
      </div>
    );

    await settled(container);
    expect(container).toHaveTextContent(long.trim());
    expect(screen.getByText('ليلة في القاهرة').tagName).toBe('STRONG');
    await expectNoA11yViolations(container);
  });
});
