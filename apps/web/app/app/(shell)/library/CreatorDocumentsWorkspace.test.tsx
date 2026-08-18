import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { CreatorDocumentsWorkspace as CreatorDocumentsWorkspaceComponent } from './CreatorDocumentsWorkspace';

function CreatorDocumentsWorkspace({
  creatorProfileId = '22222222-2222-4222-8222-222222222222',
  ...props
}: Omit<
  ComponentProps<typeof CreatorDocumentsWorkspaceComponent>,
  'creatorProfileId'
> & { readonly creatorProfileId?: string }) {
  return (
    <CreatorDocumentsWorkspaceComponent
      creatorProfileId={creatorProfileId}
      {...props}
    />
  );
}

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/components/organisms/RichTextEditor', () => ({
  RichTextEditor: ({
    ariaLabel,
    onChange,
  }: {
    ariaLabel: string;
    onChange: (change: {
      content: { type: 'doc'; content: Record<string, unknown>[] };
      plainText: string;
    }) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      onChange={event =>
        onChange({
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: event.target.value }],
              },
            ],
          },
          plainText: event.target.value,
        })
      }
    />
  ),
}));

vi.mock('@/components/molecules/drawer/EntitySidebarShell', () => ({
  EntitySidebarShell: ({
    children,
    footer,
    onClose,
  }: {
    children: React.ReactNode;
    footer: React.ReactNode;
    onClose: () => void;
  }) => (
    <aside>
      <button type='button' onClick={onClose}>
        Close document
      </button>
      {children}
      {footer}
    </aside>
  ),
}));

const document = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'A durable idea',
  kind: 'idea' as const,
  stage: 'private_draft' as const,
  currentRevision: 1,
  content: { type: 'doc' as const, content: [] },
  plainText: 'Body',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

describe('CreatorDocumentsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    globalThis.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures an idea privately with an idempotency key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ documentId: document.id }), { status: 201 })
    );
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    render(<CreatorDocumentsWorkspace initialDocuments={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Idea' }));
    fireEvent.change(screen.getByLabelText('Idea Title'), {
      target: { value: 'Misunderstood recovery claim' },
    });
    fireEvent.change(screen.getByLabelText('Idea Details'), {
      target: { value: 'Research both strongest explanations.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Privately' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(request).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      title: 'Misunderstood recovery claim',
      body: 'Research both strongest explanations.',
    });
    expect(JSON.parse(String(request?.body)).idempotencyKey).toBeTruthy();
  });

  it('retries an unconfirmed capture with the same idempotency key', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ documentId: document.id }), {
          status: 200,
        })
      );
    vi.stubGlobal('location', { reload: vi.fn() });

    render(<CreatorDocumentsWorkspace initialDocuments={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Idea' }));
    fireEvent.change(screen.getByLabelText('Idea Title'), {
      target: { value: 'One retry-safe idea' },
    });
    fireEvent.change(screen.getByLabelText('Idea Details'), {
      target: { value: 'Keep this exact capture private.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Privately' }));
    await screen.findByRole('button', { name: 'Retry Private Save' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Private Save' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const first = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    const second = JSON.parse(
      String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)
    );
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('restores a capture retry with the same key after navigation', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ documentId: document.id }), {
          status: 200,
        })
      );
    vi.stubGlobal('location', { reload: vi.fn() });
    const firstView = render(
      <CreatorDocumentsWorkspace initialDocuments={[]} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Idea' }));
    fireEvent.change(screen.getByLabelText('Idea Title'), {
      target: { value: 'Navigation-safe idea' },
    });
    fireEvent.change(screen.getByLabelText('Idea Details'), {
      target: { value: 'Keep one capture identity.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Privately' }));
    await screen.findByRole('button', { name: 'Retry Private Save' });
    const first = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    firstView.unmount();

    render(<CreatorDocumentsWorkspace initialDocuments={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Privately' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const second = JSON.parse(
      String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)
    );
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('does not restore an idea draft from another creator profile', () => {
    globalThis.sessionStorage.setItem(
      'jovie:creator-idea-draft:v1:profile-a',
      JSON.stringify({ title: 'Private A', body: 'Only for A' })
    );

    render(
      <CreatorDocumentsWorkspace
        creatorProfileId='profile-b'
        initialDocuments={[]}
      />
    );

    expect(screen.queryByLabelText('Idea Title')).toBeNull();
  });

  it('opens a Tasks-like accessible right panel for the selected revision', () => {
    render(<CreatorDocumentsWorkspace initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));

    const registeredPanel = vi
      .mocked(useRegisterRightPanel)
      .mock.calls.at(-1)?.[0];
    expect(registeredPanel).toBeTruthy();
    if (!registeredPanel) throw new Error('Expected a document panel');
    render(registeredPanel);
    expect(screen.getByLabelText('Document Title')).toBeInTheDocument();
  });

  it('persists an edit as the next optimistic revision', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 2 }), { status: 200 })
    );
    render(<CreatorDocumentsWorkspace initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'A durable revised idea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Revision' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(`/api/library/documents/${document.id}`);
    expect(JSON.parse(String(request?.body))).toMatchObject({
      expectedRevision: 1,
      title: 'A durable revised idea',
      plainText: 'Body',
    });
    expect(
      await screen.findByText('Saved as a new revision')
    ).toBeInTheDocument();
  });

  it('clears a saved status when the title is edited again', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 2 }), { status: 200 })
    );
    render(<CreatorDocumentsWorkspace initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'First saved title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Revision' }));
    await screen.findByText('Saved as a new revision');

    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'New unsaved title' },
    });

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.queryByText('Saved as a new revision')).toBeNull();
  });

  it('keeps rich content and plain text aligned across later revisions', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 2 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 3 }), { status: 200 })
      );
    render(<CreatorDocumentsWorkspace initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const firstPanel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!firstPanel) throw new Error('Expected a document panel');
    const firstPanelView = render(firstPanel);

    fireEvent.change(screen.getByLabelText('Document Content'), {
      target: { value: 'Updated body' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Revision' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await screen.findByText('Saved as a new revision');
    firstPanelView.unmount();

    const secondPanel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!secondPanel) throw new Error('Expected the saved document panel');
    render(secondPanel);
    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Title-only follow-up' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Revision' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const secondRequest = vi.mocked(fetch).mock.calls[1]?.[1];
    expect(JSON.parse(String(secondRequest?.body))).toMatchObject({
      expectedRevision: 2,
      title: 'Title-only follow-up',
      plainText: 'Updated body',
    });
  });

  it('keeps edits made while a revision save is in flight dirty', async () => {
    let finishSave: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise(resolve => {
        finishSave = resolve;
      })
    );
    render(<CreatorDocumentsWorkspace initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Submitted title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Revision' }));
    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Newer unsaved title' },
    });
    await act(async () => {
      finishSave?.(
        new Response(JSON.stringify({ revision: 2 }), { status: 200 })
      );
    });

    expect(screen.getByLabelText('Document Title')).toHaveValue(
      'Newer unsaved title'
    );
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('keeps exact-revision approval disabled while visible edits are unsaved', () => {
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[
          { ...document, kind: 'script', stage: 'evidence_review' },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Unsaved title' },
    });
    expect(
      screen.getByRole('button', { name: 'Approve For Capture' })
    ).toBeDisabled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('guards closing and switching documents while a draft is unsaved', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const secondDocument = {
      ...document,
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Second document',
    };
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[document, secondDocument]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    const panelView = render(panel);
    const panelRegistrationCount = vi.mocked(useRegisterRightPanel).mock.calls
      .length;
    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Unsaved document title' },
    });

    await waitFor(() =>
      expect(
        vi.mocked(useRegisterRightPanel).mock.calls.length
      ).toBeGreaterThan(panelRegistrationCount)
    );
    const guardedPanel = vi
      .mocked(useRegisterRightPanel)
      .mock.calls.at(-1)?.[0];
    if (!guardedPanel) throw new Error('Expected a guarded document panel');
    panelView.rerender(guardedPanel);

    fireEvent.click(screen.getByRole('button', { name: 'Close document' }));
    fireEvent.click(screen.getByRole('button', { name: /Second document/ }));

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Document Title')).toHaveValue(
      'Unsaved document title'
    );
  });

  it('restores document and claim drafts after client-side navigation', async () => {
    const firstWorkspace = render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const firstPanel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!firstPanel) throw new Error('Expected a document panel');
    const firstPanelView = render(firstPanel);
    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Recovered title draft' },
    });
    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'Recovered evidence draft' },
    });
    await waitFor(() =>
      expect(globalThis.sessionStorage.length).toBeGreaterThan(0)
    );
    firstPanelView.unmount();
    firstWorkspace.unmount();

    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const restoredPanel = vi
      .mocked(useRegisterRightPanel)
      .mock.calls.at(-1)?.[0];
    if (!restoredPanel) throw new Error('Expected a restored document panel');
    render(restoredPanel);

    await waitFor(() =>
      expect(screen.getByLabelText('Document Title')).toHaveValue(
        'Recovered title draft'
      )
    );
    expect(screen.getByLabelText('Claim Text')).toHaveValue(
      'Recovered evidence draft'
    );
  });

  it('keeps a restored draft bound to its original base revision', async () => {
    const firstWorkspace = render(
      <CreatorDocumentsWorkspace initialDocuments={[document]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const firstPanel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!firstPanel) throw new Error('Expected a document panel');
    const panelView = render(firstPanel);
    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Stale but recoverable draft' },
    });
    await waitFor(() => expect(globalThis.sessionStorage.length).toBe(1));
    panelView.unmount();
    firstWorkspace.unmount();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 409 }));
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, currentRevision: 2 }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const restoredPanel = vi
      .mocked(useRegisterRightPanel)
      .mock.calls.at(-1)?.[0];
    if (!restoredPanel) throw new Error('Expected a restored document panel');
    render(restoredPanel);
    await waitFor(() =>
      expect(screen.getByLabelText('Document Title')).toHaveValue(
        'Stale but recoverable draft'
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Revision' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
        .expectedRevision
    ).toBe(1);
    expect(
      await screen.findByText('Revision changed. Reload before continuing.')
    ).toBeInTheDocument();
  });

  it('removes a persisted document draft when discard is confirmed', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    render(<CreatorDocumentsWorkspace initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const firstPanel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!firstPanel) throw new Error('Expected a document panel');
    const panelView = render(firstPanel);
    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Discard me' },
    });
    await waitFor(() => expect(globalThis.sessionStorage.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Close document' }));
    panelView.unmount();
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const reopenedPanel = vi
      .mocked(useRegisterRightPanel)
      .mock.calls.at(-1)?.[0];
    if (!reopenedPanel) throw new Error('Expected a reopened document panel');
    render(reopenedPanel);

    expect(globalThis.sessionStorage.length).toBe(0);
    expect(screen.getByLabelText('Document Title')).toHaveValue(document.title);
  });

  it('shows a completed status after exact-revision capture approval', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ stage: 'capture_ready' }), { status: 200 })
    );
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[
          { ...document, kind: 'script', stage: 'evidence_review' },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.click(
      screen.getByRole('button', { name: 'Approve For Capture' })
    );

    expect(
      (await screen.findAllByText('Approved for capture')).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Saving…')).toBeNull();
  });

  it('provides an evidence path before creator approval', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ claimId: 'claim-1' }), { status: 201 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ stage: 'evidence_review' }), {
          status: 200,
        })
      );
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'Recovery differs by training history.' },
    });
    fireEvent.change(screen.getByLabelText('Memory Source Record ID'), {
      target: { value: '44444444-4444-4444-8444-444444444444' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Claim' }));
    await screen.findByText('Claim added to this revision');
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Evidence Review' })
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/claims');
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toContain('/review');
  });

  it('keeps evidence review disabled while a claim draft is unsaved', () => {
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    const reviewButton = screen.getByRole('button', {
      name: 'Complete Evidence Review',
    });
    expect(reviewButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'An unsaved factual claim' },
    });

    expect(reviewButton).toBeDisabled();
  });

  it('does not offer permanently blocking evidence states for factual claims', () => {
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    expect(screen.queryByRole('option', { name: 'Contested' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Unresolved' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Claim Type'), {
      target: { value: 'opinion' },
    });
    fireEvent.change(screen.getByLabelText('Evidence State'), {
      target: { value: 'contested' },
    });
    fireEvent.change(screen.getByLabelText('Claim Type'), {
      target: { value: 'fact' },
    });

    expect(screen.getByLabelText('Evidence State')).toHaveValue('supported');
    expect(screen.queryByRole('option', { name: 'Contested' })).toBeNull();
  });

  it('retains claim evidence after a failed submission', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'Retain this claim' },
    });
    fireEvent.change(screen.getByLabelText('Memory Source Record ID'), {
      target: { value: '44444444-4444-4444-8444-444444444444' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Claim' }));

    await screen.findByText('Action failed. Retry safely.');
    expect(screen.getByLabelText('Claim Text')).toHaveValue(
      'Retain this claim'
    );
    expect(screen.getByLabelText('Memory Source Record ID')).toHaveValue(
      '44444444-4444-4444-8444-444444444444'
    );
  });

  it('retries a lost claim response with the same ledger key', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ claimId: 'claim-1' }), { status: 201 })
      );
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);
    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'Retry-safe evidence' },
    });
    fireEvent.change(screen.getByLabelText('Memory Source Record ID'), {
      target: { value: '44444444-4444-4444-8444-444444444444' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Claim' }));
    await screen.findByText('Action failed. Retry safely.');
    fireEvent.click(screen.getByRole('button', { name: 'Add Claim' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const first = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    const second = JSON.parse(
      String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)
    );
    expect(first.idempotencyKey).toBeTruthy();
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('does not clear newer evidence entered during claim submission', async () => {
    let finishClaim: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise(resolve => {
        finishClaim = resolve;
      })
    );
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'Submitted evidence' },
    });
    fireEvent.change(screen.getByLabelText('Memory Source Record ID'), {
      target: { value: '44444444-4444-4444-8444-444444444444' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Claim' }));
    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'Newer evidence' },
    });
    await act(async () => {
      finishClaim?.(
        new Response(JSON.stringify({ claimId: 'claim-1' }), { status: 201 })
      );
    });

    expect(screen.getByLabelText('Claim Text')).toHaveValue('Newer evidence');
  });

  it('requires a source for every supported claim kind', () => {
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Claim Type'), {
      target: { value: 'opinion' },
    });
    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'This framing is strongest.' },
    });
    expect(screen.getByRole('button', { name: 'Add Claim' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Memory Source Record ID'), {
      target: { value: '44444444-4444-4444-8444-444444444444' },
    });
    expect(screen.getByRole('button', { name: 'Add Claim' })).toBeEnabled();
  });

  it('explains how to recover from incomplete evidence review', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'Evidence incomplete',
          code: 'evidence_incomplete',
        }),
        { status: 409 }
      )
    );
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Evidence Review' })
    );

    expect(
      await screen.findByText(
        'Resolve or source every factual claim, then retry.'
      )
    ).toBeInTheDocument();
  });

  it('labels a stale evidence-review revision as a conflict', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'Revision changed',
          code: 'revision_conflict',
        }),
        { status: 409 }
      )
    );
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Evidence Review' })
    );

    expect(
      await screen.findByText('Revision changed. Reload before continuing.')
    ).toBeInTheDocument();
  });

  it('keeps load failures distinct from an empty library and retries', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ documents: [document], nextCursor: null }),
        {
          status: 200,
        }
      )
    );
    render(
      <CreatorDocumentsWorkspace initialDocuments={[]} initialLoadFailed />
    );

    expect(screen.queryByText('No ideas yet. Save the first one.')).toBeNull();
    expect(
      screen.getByText(
        'Private documents could not be loaded. Your work is still saved.'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('A durable idea')).toBeInTheDocument();
  });

  it('loads older documents through the opaque cursor', async () => {
    const olderDocument = {
      ...document,
      id: '22222222-2222-4222-8222-222222222222',
      title: 'An older script',
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ documents: [olderDocument], nextCursor: null }),
        { status: 200 }
      )
    );
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[document]}
        initialNextCursor='opaque cursor'
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Load Older Documents' })
    );

    expect(await screen.findByText('An older script')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/library/documents?cursor=opaque%20cursor'
    );
  });
});
