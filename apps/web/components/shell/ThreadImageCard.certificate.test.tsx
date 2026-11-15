import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ThreadImageCard } from './ThreadImageCard';

const PREVIEW = 'https://x.invalid/preview.jpg';

describe('ThreadImageCard certificate', () => {
  it('fires download, copy and regenerate from the toolbar, axe-clean', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    const onCopy = vi.fn();
    const onRegenerate = vi.fn();
    const { container } = render(
      <ThreadImageCard
        status='ready'
        prompt='Tour poster'
        previewUrl={PREVIEW}
        onDownload={onDownload}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
      />
    );
    expect(
      screen.getByRole('img', { name: 'Tour poster' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download' }));
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows the prompt and no toolbar while generating, axe-clean', async () => {
    const { container } = render(
      <ThreadImageCard status='generating' prompt='Tour poster' />
    );
    expect(screen.getByText(/Generating/)).toHaveTextContent(
      'Generating “Tour poster”'
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('offers only the provided action', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(
      <ThreadImageCard
        status='ready'
        prompt='Tour poster'
        previewUrl={PREVIEW}
        onDownload={onDownload}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('keeps long and RTL prompts axe-clean', async () => {
    const prompt =
      'A neon-lit tour poster for a synthwave album with chrome lettering and every tour date listed down the right edge';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ThreadImageCard status='ready' prompt={prompt} previewUrl={PREVIEW} />
        <ThreadImageCard status='generating' prompt='ملصق جولة بإضاءة نيون' />
      </div>
    );
    expect(screen.getByRole('img', { name: prompt })).toBeInTheDocument();
    expect(screen.getByText('ملصق جولة بإضاءة نيون')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
