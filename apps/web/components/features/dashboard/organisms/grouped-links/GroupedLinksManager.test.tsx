import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GroupedLinksManager } from './GroupedLinksManager';

const hoisted = vi.hoisted(() => ({
  push: vi.fn(),
  nextLink: null as DetectedLink | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: hoisted.push }),
}));

vi.mock('@/features/dashboard/molecules/universal-link-input', () => ({
  UniversalLinkInput: ({
    onAdd,
    onChatSubmit,
    prefillUrl,
  }: {
    readonly onAdd: (link: DetectedLink) => void;
    readonly onChatSubmit?: (message: string) => void;
    readonly prefillUrl?: string;
  }) => (
    <div>
      <label>
        Describe a task
        <input defaultValue={prefillUrl ?? ''} />
      </label>
      <button
        type='button'
        onClick={() => hoisted.nextLink && onAdd(hoisted.nextLink)}
      >
        Add link
      </button>
      <button type='button' onClick={() => onChatSubmit?.('Plan my release')}>
        Send chat
      </button>
    </div>
  ),
}));

vi.mock('../links/ChatStyleLinkList', () => ({
  ChatStyleLinkList: ({
    links,
    onHint,
  }: {
    readonly links: DetectedLink[];
    readonly onHint: (hint: string | null) => void;
  }) => (
    <div>
      <ul aria-label='Your links'>
        {links.map(link => (
          <li key={link.normalizedUrl}>{link.platform.name}</li>
        ))}
      </ul>
      <button type='button' onClick={() => onHint('That link cannot go there')}>
        Show hint
      </button>
    </div>
  ),
}));

vi.mock('../links/QuickAddSuggestions', () => ({
  QuickAddSuggestions: ({
    onPlatformSelect,
  }: {
    readonly onPlatformSelect: (url: string) => void;
  }) => (
    <button
      type='button'
      onClick={() => onPlatformSelect('https://instagram.com/')}
    >
      Add Instagram
    </button>
  ),
}));

vi.mock('../links/IngestedSuggestions', () => ({
  IngestedSuggestions: () => <p>Suggested links</p>,
}));

vi.mock('../links/YouTubeCrossCategoryPrompt', () => ({
  YouTubeCrossCategoryPrompt: () => null,
}));

vi.mock('../InlineChatArea', () => ({ InlineChatArea: () => null }));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

function link(id: string, name: string): DetectedLink {
  return {
    platform: {
      id,
      name,
      category: 'social',
      icon: id,
      color: '000000',
      placeholder: `https://${id}.com/user`,
    },
    normalizedUrl: `https://${id}.com/user`,
    originalUrl: `https://${id}.com/user`,
    suggestedTitle: name,
    isValid: true,
  };
}

describe('GroupedLinksManager', () => {
  beforeEach(() => {
    hoisted.push.mockReset();
    hoisted.nextLink = null;
  });

  it('shows the empty state with the input first and stays axe-clean', async () => {
    const { container } = render(<GroupedLinksManager initialLinks={[]} />);

    expect(
      screen.getByRole('region', { name: 'Links Manager' })
    ).toBeInTheDocument();
    expect(screen.getByText('Add your first link')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('adds a link from the input and switches to the list', async () => {
    const user = userEvent.setup();
    const onLinkAdded = vi.fn();
    hoisted.nextLink = link('instagram', 'Instagram');
    render(<GroupedLinksManager initialLinks={[]} onLinkAdded={onLinkAdded} />);

    await user.click(screen.getByRole('button', { name: 'Add link' }));

    expect(
      await screen.findByRole('list', { name: 'Your links' })
    ).toHaveTextContent('Instagram');
    expect(screen.queryByText('Add your first link')).not.toBeInTheDocument();
  });

  it('keeps typed input across a parent rerender and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GroupedLinksManager initialLinks={[]} />);

    const input = screen.getByLabelText('Describe a task');
    await user.type(input, 'spotify');
    rerender(<GroupedLinksManager initialLinks={[]} className='mt-2' />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Describe a task')).toHaveValue('spotify');
    expect(screen.getByLabelText('Describe a task')).toHaveFocus();
  });

  it('sends a chat message to the chat page when no inline chat is open', async () => {
    const user = userEvent.setup();
    render(<GroupedLinksManager initialLinks={[]} />);

    await user.click(screen.getByRole('button', { name: 'Send chat' }));

    expect(hoisted.push).toHaveBeenCalledWith(
      expect.stringContaining('?q=Plan%20my%20release')
    );
  });

  it('prefills the input from a quick-add platform', async () => {
    const user = userEvent.setup();
    render(<GroupedLinksManager initialLinks={[]} />);

    await user.click(screen.getByRole('button', { name: 'Add Instagram' }));

    expect(screen.getByLabelText('Describe a task')).toHaveValue(
      'https://instagram.com/'
    );
  });

  it('shows a drag hint with the warning tokens axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <GroupedLinksManager
        initialLinks={[
          link('instagram', 'Instagram'),
          link('tiktok', 'TikTok'),
        ]}
      />
    );

    expect(screen.getByRole('list', { name: 'Your links' })).toHaveTextContent(
      'TikTok'
    );
    await user.click(screen.getByRole('button', { name: 'Show hint' }));

    const hint = await screen.findByText('That link cannot go there');
    expect(hint).toHaveClass('bg-warning-subtle', 'text-warning-text');
    expect(hint.className).not.toMatch(/amber/);
    await expectNoA11yViolations(container);
  });

  it('centres the input with a prompt when the sidebar is open', async () => {
    const { container } = render(
      <GroupedLinksManager
        initialLinks={[link('instagram', 'Instagram')]}
        sidebarOpen
      />
    );

    expect(
      screen.getByText('What other profiles do you have?')
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Your links' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders many links right-to-left axe-clean', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      link(`platform${i}`, `Platform with a long name ${i}`)
    );
    const { container } = render(
      <div dir='rtl'>
        <GroupedLinksManager initialLinks={many} />
      </div>
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    await expectNoA11yViolations(container);
  });
});
